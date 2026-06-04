export enum SupportedBlockchainCode {
    ETHEREUM = 'eth',
    BINANCE_SMART_CHAIN = 'bsc',
    POLYGON = 'pgn',
    ARBITRUM_ONE = 'arb',
    BASE = 'base',
    SOLANA = 'sol',
}

export const SUPPORTED_BLOCKCHAIN_CODES = Object.values(
    SupportedBlockchainCode,
);

export interface BlockchainConfig {
    code: SupportedBlockchainCode;
    name: string;
    chainId: number | null;
    isEvm: boolean;
    decimals: number;
}

export const BLOCKCHAIN_CONFIGS: Record<
    SupportedBlockchainCode,
    BlockchainConfig
> = {
    [SupportedBlockchainCode.ETHEREUM]: {
        code: SupportedBlockchainCode.ETHEREUM,
        name: 'Ethereum',
        chainId: 1,
        isEvm: true,
        decimals: 6,
    },
    [SupportedBlockchainCode.BINANCE_SMART_CHAIN]: {
        code: SupportedBlockchainCode.BINANCE_SMART_CHAIN,
        name: 'Binance Smart Chain',
        chainId: 56,
        isEvm: true,
        decimals: 18,
    },
    [SupportedBlockchainCode.POLYGON]: {
        code: SupportedBlockchainCode.POLYGON,
        name: 'Polygon',
        chainId: 137,
        isEvm: true,
        decimals: 6,
    },
    [SupportedBlockchainCode.ARBITRUM_ONE]: {
        code: SupportedBlockchainCode.ARBITRUM_ONE,
        name: 'Arbitrum One',
        chainId: 42161,
        isEvm: true,
        decimals: 6,
    },
    [SupportedBlockchainCode.BASE]: {
        code: SupportedBlockchainCode.BASE,
        name: 'Base',
        chainId: 8453,
        isEvm: true,
        decimals: 6,
    },
    [SupportedBlockchainCode.SOLANA]: {
        code: SupportedBlockchainCode.SOLANA,
        name: 'Solana',
        chainId: null,
        isEvm: false,
        decimals: 6,
    },
};

export const isValidBlockchainCode = (
    code: string,
): code is SupportedBlockchainCode => {
    return SUPPORTED_BLOCKCHAIN_CODES.includes(code as SupportedBlockchainCode);
};

export const getBlockchainConfig = (
    code: SupportedBlockchainCode,
): BlockchainConfig => {
    return BLOCKCHAIN_CONFIGS[code];
};
