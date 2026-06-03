/**
 * Email helpers ported from Agentic Inbox
 * Includes threading, HTML utilities, rate limiting logic
 */

export interface EmailFull {
  id: string;
  subject: string;
  sender: string;
  recipient: string;
  cc?: string | null;
  bcc?: string | null;
  date: string;
  body: string;
  read?: boolean;
  starred?: boolean;
  in_reply_to?: string | null;
  email_references?: string | null;
  thread_id?: string | null;
  message_id?: string | null;
  raw_headers?: string | null;
}

export interface StoredAttachment {
  id: string;
  email_id: string;
  filename: string;
  mimetype: string;
  size: number;
  content_id?: string | null;
  disposition?: string | null;
}

/**
 * Normalize email subject by stripping reply/forward prefixes
 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(?:(?:re|fwd?|fw|aw|wg|r[eé]f|sv)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

/**
 * Validate sender matches the mailbox
 */
export function validateSender(
  to: string | string[],
  from: string | { email: string; name: string },
  mailboxId: string,
): { toStr: string; fromEmail: string; fromDomain: string } {
  const toStr = (Array.isArray(to) ? to.join(", ") : to).toLowerCase();
  const fromEmail = (typeof from === "string" ? from : from.email).toLowerCase();

  if (fromEmail !== mailboxId.toLowerCase()) {
    throw new Error("From address must match the mailbox email address");
  }

  const fromDomain = fromEmail.split("@")[1];
  if (!fromDomain) {
    throw new Error("Invalid sender email address");
  }

  return { toStr, fromEmail, fromDomain };
}

/**
 * Generate RFC 2822 Message-ID
 */
export function generateMessageId(fromDomain: string): {
  messageId: string;
  outgoingMessageId: string;
} {
  const messageId = crypto.randomUUID();
  const outgoingMessageId = `${messageId}@${fromDomain}`;
  return { messageId, outgoingMessageId };
}

/**
 * Build References chain from original email
 */
export function buildReferencesChain(original: EmailFull): {
  originalMsgId: string;
  references: string[];
  threadId: string;
} {
  const originalMsgId = original.message_id || original.id;
  let existingRefs: string[] = [];
  if (original.email_references) {
    try {
      existingRefs = JSON.parse(original.email_references);
    } catch {
      // Malformed JSON - treat as empty
    }
  }
  const references = [...existingRefs, originalMsgId].filter(Boolean);
  const threadId = original.thread_id || original.id;
  return { originalMsgId, references, threadId };
}

/**
 * Build threading headers for email binding
 */
export function buildThreadingHeaders(
  originalMsgId: string,
  references: string[],
): Record<string, string> {
  return {
    "In-Reply-To": `<${originalMsgId}>`,
    ...(references.length > 0
      ? { References: references.map((r) => `<${r}>`).join(" ") }
      : {}),
  };
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert plain text to HTML
 */
export function textToHtml(text: string): string {
  if (!text) return "";
  const escaped = escapeHtml(text).replace(/\n/g, "<br>");
  return `<div style="white-space:pre-wrap">${escaped}</div>`;
}

/**
 * Strip HTML to plain text
 */
export function stripHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build quoted reply block
 */
export function buildQuotedReplyBlock(original: {
  date?: string;
  sender?: string;
  body?: string;
}): string {
  if (!original.body) return "";
  
  const originalSender = escapeHtml(original.sender || "unknown");
  const originalDate = escapeHtml(original.date || "");
  const plainBody = stripHtmlToText(original.body);
  const bodyToQuote = escapeHtml(plainBody).replace(/\n/g, "<br>");

  return `<br><blockquote style="border-left: 2px solid #ccc; margin: 0; padding-left: 1em; color: #666;">On ${originalDate}, ${originalSender} wrote:<br><br>${bodyToQuote}</blockquote>`;
}

/**
 * Extract Message-ID from header value
 */
export function extractMsgId(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return m ? m[1] : s.trim().split(/\s+/)[0];
}

/**
 * Check rate limits for sending emails
 * Limits: 20 emails/hour, 100/day per inbox
 */
export async function checkSendRateLimit(
  prisma: any,
  inboxId: string,
): Promise<string | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const hourCount = await prisma.emailMessage.count({
    where: {
      inboxId,
      direction: 'OUTBOUND',
      sentAt: { gte: oneHourAgo },
    },
  });

  if (hourCount >= 20) {
    return "Rate limit exceeded: max 20 emails per hour per inbox";
  }

  const dayCount = await prisma.emailMessage.count({
    where: {
      inboxId,
      direction: 'OUTBOUND',
      sentAt: { gte: oneDayAgo },
    },
  });

  if (dayCount >= 100) {
    return "Rate limit exceeded: max 100 emails per day per inbox";
  }

  return null;
}
