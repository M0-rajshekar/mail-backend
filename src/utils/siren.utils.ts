import {
    PrismaClient,
    SubscriptionStatus,
    UserStatus,
    PaymentPlan,
} from 'generated/prisma';
import { FlexPriceInput } from './siren.consumer';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';

/**
 * Processes a user charge for SocialPilot AI chat usage.
 *
 * This function:
 *  - Calculates the number of credits to charge based on the model, tokens, and usage type.
 *  - Sends a usage event to FlexPrice for metering and analytics.
 *  - Updates the user's credit usage in the database according to their current payment plan.
 *  - Handles overflow logic for subscriptions, including using top-up credits and pausing users if necessary.
 *
 * @param {FlexPriceInput} input - The input object containing user, model, and token usage details.
 * @throws {Error} If required environment variables are missing, the user is not found, or balance is insufficient.
 */
export const processUserCharge = async (input: FlexPriceInput) => {
    const {
        id,
        userId,
        tokens,
        model,
        type,
        created,
        input_tokens,
        output_tokens,
    } = input;
    const prisma = new PrismaClient();

    if (!process.env.FLEXPRICE_BASE_URL || !process.env.FLEXPRICE_API_KEY) {
        throw new Error('Missing required environment variables for FlexPrice');
    }

    try {
        // Calculate balance reduction based on type
        let balanceIncreased: number;
        switch (type) {
            case 'mcp-ai':
            case 'edgetrue-chat': {
                // AI chat usage - calculate based on tokens and model
                balanceIncreased = calculateBalanceIncrease({
                    model,
                    input_tokens: input_tokens as number,
                    output_tokens: output_tokens as number,
                });
                break;
            }
            default:
                throw new Error('Invalid type provided');
        }

        // Get current balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Deduct credits
        if (type === 'mcp-ai' || type === 'edgetrue-chat') {
            // Skip if no tokens to charge (prevents Prisma increment error)
            if (balanceIncreased <= 0) {
                console.log(
                    `[processUserCharge] Skipping credit deduction - no tokens to charge (balanceIncreased: ${balanceIncreased})`,
                );
                // Still send FlexPrice event for tracking
                await sendFlexPriceEvent({
                    type,
                    id,
                    time: created,
                    source: 'SocialPilot',
                    subject: userId,
                    data: {
                        credits: balanceIncreased,
                        model,
                        currentPlan: user.currentPlan,
                    },
                });
                return;
            }

            // Handle credit deduction based on user's payment plan
            switch (user.currentPlan) {
                case 'FREE': {
                    const credits = await prisma.credits.findUnique({
                        where: { userId: userId },
                    });

                    if (credits) {
                        const newCreditUsage =
                            (credits.creditUsage || 0) + balanceIncreased;

                        if (newCreditUsage > credits.availableCredits) {
                            // User has exceeded their free credits, pause them
                            await prisma.credits.update({
                                where: { userId: userId },
                                data: {
                                    creditUsage: credits.availableCredits,
                                },
                            });

                            await prisma.user.update({
                                where: { id: userId },
                                data: { status: UserStatus.PAUSED },
                            });
                        } else {
                            await prisma.credits.update({
                                where: { userId: userId },
                                data: {
                                    creditUsage: {
                                        increment: balanceIncreased,
                                    },
                                },
                            });
                        }
                    }
                    break;
                }

                case 'TOP_UP': {
                    const topUp = await prisma.topUp.findUnique({
                        where: { userId: userId },
                    });

                    if (topUp) {
                        const newCreditUsage =
                            topUp.creditUsage + balanceIncreased;

                        if (newCreditUsage > topUp.totalCredits) {
                            // User has exceeded their top-up credits, pause them
                            await prisma.topUp.update({
                                where: { userId: userId },
                                data: {
                                    creditUsage: topUp.totalCredits,
                                },
                            });

                            await prisma.user.update({
                                where: { id: userId },
                                data: { status: UserStatus.PAUSED },
                            });
                        } else {
                            await prisma.topUp.update({
                                where: { userId: userId },
                                data: {
                                    creditUsage: {
                                        increment: balanceIncreased,
                                    },
                                },
                            });
                        }
                    }
                    break;
                }

                case 'SUBSCRIPTION': {
                    const subscription = await prisma.subscription.findFirst({
                        where: {
                            userId: userId,
                            subscriptionStatus: SubscriptionStatus.ACTIVE,
                        },
                    });

                    if (subscription) {
                        const newCreditUsage =
                            subscription.creditUsage + balanceIncreased;

                        if (newCreditUsage > subscription.totalCredits) {
                            // User has exceeded their subscription credits, pause them
                            await prisma.subscription.update({
                                where: { id: subscription.id },
                                data: {
                                    creditUsage: subscription.totalCredits,
                                },
                            });

                            await prisma.user.update({
                                where: { id: userId },
                                data: { status: UserStatus.PAUSED },
                            });
                        } else {
                            await prisma.subscription.update({
                                where: { id: subscription.id },
                                data: {
                                    creditUsage: {
                                        increment: balanceIncreased,
                                    },
                                },
                            });
                        }
                    }
                    break;
                }
            }
        }

        // Send FlexPrice event
        // Normalize 'edgetrue-chat' to 'mcp-ai' for FlexPrice categorization
        const flexPriceType = type === 'edgetrue-chat' ? 'mcp-ai' : type;

        await sendFlexPriceEvent({
            type: flexPriceType,
            id,
            time: created,
            source: 'SocialPilot',
            subject: userId,
            data: {
                credits: balanceIncreased,
                model,
                currentPlan: user.currentPlan,
            },
        });
    } catch (error) {
        if (error.message === 'Insufficient balance') {
            throw error;
        }
        throw new Error(`Failed to process charge: ${error.message}`);
    } finally {
        await prisma.$disconnect();
    }
};

/**
 * Calculates the number of credits to charge based on model pricing and token usage.
 *
 * The calculation:
 *  - Looks up model-specific input/output token rates (per million tokens).
 *  - Computes the cost for input and output tokens.
 *  - Adds a 0.5% fee to the total.
 *  - Multiplies by margin multiple (default 3x).
 *  - Converts the dollar cost to credits using the provided or default credits-per-dollar rate.
 *
 * @param {Object} params - The calculation parameters.
 * @param {string} params.model - The model name.
 * @param {number} params.input_tokens - Number of input tokens.
 * @param {number} params.output_tokens - Number of output tokens.
 * @param {number} [params.creditsPerDollar] - Credits per dollar (default: 200 or from env).
 * @returns {number} The number of credits to charge (rounded to 2 decimals).
 */
export function calculateBalanceIncrease({
    model,
    input_tokens,
    output_tokens,
    creditsPerDollar = parseFloat(process.env.CREDITS_PER_DOLLAR || '200'),
}: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    creditsPerDollar?: number;
}): number {
    // Model-specific pricing rates (per million tokens)
    const modelPricing: Record<string, { input: number; output: number }> = {
        'thedrummer/unslopnemo-12b': { input: 0.5, output: 0.5 },
        'infermatic/mn-inferor-12b': { input: 0.8, output: 1.2 },
        'microsoft/phi-4-multimodal-instruct': { input: 0.05, output: 0.1 },
        'mistralai/codestral-2501': { input: 0.3, output: 0.9 },
        'tokyotech-llm/llama-3.1-swallow-70b-instruct-v0.3': {
            input: 0.6,
            output: 1.2,
        },
        'minimax/minimax-01': { input: 0.2, output: 1.1 },
        'mistralai/codestral-mamba': { input: 0.25, output: 0.25 },
        'meta-llama/llama-2-70b-chat': { input: 0.9, output: 0.9 },
        'google/gemma-2-9b-it': { input: 0.07, output: 0.07 },
        'openchat/openchat-7b': { input: 0.07, output: 0.07 },
        'thedrummer/rocinante-12b': { input: 0.25, output: 0.5 },
        'microsoft/wizardlm-2-8x22b': { input: 0.5, output: 0.5 },
        'microsoft/wizardlm-2-7b': { input: 0.07, output: 0.07 },
        'qwen/qwen-2.5-coder-32b-instruct': { input: 0.07, output: 0.15 },
        'microsoft/phi-4': { input: 0.07, output: 0.14 },
        'meta-llama/llama-3.3-70b-instruct': { input: 0.12, output: 0.28 },
        'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
        'openai/gpt-4o-mini-tts': { input: 0.6, output: 12 },
        'llama-3.3-70b-specdec': { input: 0.59, output: 0.99 },
        'openai/gpt-4.1-nano': { input: 0.1, output: 0.4 },
        'claude-3-5-sonnet-20240620': { input: 3, output: 15 },
        'claude-3-haiku-20240307': { input: 0.8, output: 4 },
        'openai/gpt-5-mini': { input: 0.25, output: 2 },
        'x-ai/grok-4-fast': { input: 0.2, output: 0.5 },
        'x-ai/grok-4': { input: 1.0, output: 2.5 },
        'openrouter/x-ai/grok-4.1-fast': { input: 0.2, output: 0.5 },
        'openrouter/x-ai/grok-4': { input: 1.0, output: 2.5 },
    };

    // Get model pricing or use default rates
    const rates = modelPricing[model] || { input: 0.1, output: 0.1 };

    // Calculate cost in dollar terms
    const promptInputTokenCost = (input_tokens / 1000000) * rates.input;
    const promptOutputTokenCost = (output_tokens / 1000000) * rates.output;

    // Add 0.5% fee
    const promptTotalCost =
        (promptInputTokenCost + promptOutputTokenCost) * 1.005;

    const marginMultiple = parseFloat(process.env.MARGIN_MULTIPLE || '3');
    const promptFinalCost = promptTotalCost * marginMultiple;

    // Convert dollar cost to credits
    return Number((promptFinalCost * creditsPerDollar).toFixed(2));
}

/**
 * Sends a usage event to the FlexPrice API for metering and analytics.
 */
export async function sendFlexPriceEvent({
    type,
    id,
    time,
    source,
    subject,
    data,
}: {
    type: string;
    id: string;
    time: string;
    source: string;
    subject: string;
    data: Record<string, any>;
}) {
    if (!process.env.FLEXPRICE_BASE_URL || !process.env.FLEXPRICE_API_KEY) {
        throw new Error('Missing required environment variables for FlexPrice');
    }
    const flexPricePayload = {
        event_name: type,
        external_customer_id: subject,
        event_id: id,
        timestamp: time,
        source,
        properties: data,
    };
    console.log(
        `[FlexPrice] Sending event: event_name=${type} user=${subject} credits=${data?.credits} model=${data?.model}`,
    );
    try {
        const response = await axios.post(
            `${process.env.FLEXPRICE_BASE_URL}/events`,
            flexPricePayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.FLEXPRICE_API_KEY,
                },
                httpAgent: new http.Agent({
                    family: 4,
                    timeout: 30000,
                }),
                httpsAgent: new https.Agent({
                    family: 4,
                    timeout: 30000,
                }),
                timeout: 30000,
            },
        );
        console.log(
            `[FlexPrice] Event sent successfully: status=${response.status}`,
        );
    } catch (error: any) {
        console.error('[FlexPrice] Failed to send event:', {
            message: error?.message,
            status: error?.response?.status,
            statusText: error?.response?.statusText,
            responseData: JSON.stringify(error?.response?.data).slice(0, 500),
        });
        throw error;
    }
}
