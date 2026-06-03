export interface NetworkConfig {
  name: string;
  type: 'evm' | 'solana';
  chainId?: number;
  displayName: string;
  isTestnet?: boolean;
  supportedByX402Express?: boolean;
  usdcTokenAddress?: string;
  rpcUrl?: string;
}

export interface NetworkConfiguration {
  supportedNetworks: NetworkConfig[];
  defaultEvmNetwork: string;
  defaultSolanaNetwork: string;
}

/**
 * Dynamic network configuration - no hardcoded values
 * Networks are loaded from environment variables or configuration
 */
export const getNetworkConfiguration = (): NetworkConfiguration => {
  // Get supported networks from environment or use defaults
  const supportedNetworksEnv = process.env.SUPPORTED_NETWORKS;
  
  let supportedNetworks: NetworkConfig[];
  
  if (supportedNetworksEnv) {
    try {
      // Parse networks from environment variable (JSON format)
      supportedNetworks = JSON.parse(supportedNetworksEnv);
    } catch (error) {
      console.warn('Failed to parse SUPPORTED_NETWORKS environment variable, using defaults');
      supportedNetworks = getDefaultNetworks();
    }
  } else {
    // Use default configuration if no environment variable is set
    supportedNetworks = getDefaultNetworks();
  }

  return {
    supportedNetworks,
    defaultEvmNetwork: process.env.DEFAULT_EVM_NETWORK || 'base',
    defaultSolanaNetwork: process.env.DEFAULT_SOLANA_NETWORK || 'solana',
  };
};

/**
 * Default network configuration - can be overridden by environment variables
 */
function getDefaultNetworks(): NetworkConfig[] {
  return [
    // EVM Networks
    {
      name: 'ethereum',
      type: 'evm',
      chainId: 1,
      displayName: 'Ethereum',
      supportedByX402Express: true,
      usdcTokenAddress: process.env.USDC_ETHEREUM_ADDRESS || '0xA0b86a91c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    {
      name: 'base',
      type: 'evm',
      chainId: 8453,
      displayName: 'Base',
      supportedByX402Express: true,
      usdcTokenAddress: process.env.USDC_BASE_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    {
      name: 'polygon',
      type: 'evm',
      chainId: 137,
      displayName: 'Polygon',
      supportedByX402Express: true,
      usdcTokenAddress: process.env.USDC_POLYGON_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    },
    {
      name: 'bsc',
      type: 'evm',
      chainId: 56,
      displayName: 'BSC',
      supportedByX402Express: true,
      usdcTokenAddress: process.env.USDC_BSC_ADDRESS || '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
    // Solana Networks
    {
      name: 'solana',
      type: 'solana',
      displayName: 'Solana',
      supportedByX402Express: false,
      usdcTokenAddress: process.env.USDC_MINT_ADDRESS || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    },
    // Testnet Networks (optional)
    {
      name: 'sepolia',
      type: 'evm',
      chainId: 11155111,
      displayName: 'Sepolia',
      isTestnet: true,
      supportedByX402Express: false,
      usdcTokenAddress: process.env.USDC_SEPOLIA_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    },
    {
      name: 'base-sepolia',
      type: 'evm',
      chainId: 84532,
      displayName: 'Base Sepolia',
      isTestnet: true,
      supportedByX402Express: false,
      usdcTokenAddress: process.env.USDC_BASE_SEPOLIA_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    {
      name: 'bsc-testnet',
      type: 'evm',
      chainId: 97,
      displayName: 'BSC Testnet',
      isTestnet: true,
      supportedByX402Express: false,
      usdcTokenAddress: process.env.USDC_BSC_TESTNET_ADDRESS || '0x64544969ed7EBf5f083679233325356EbE738930',
    },
    {
      name: 'solana-devnet',
      type: 'solana',
      displayName: 'Solana Devnet',
      isTestnet: true,
      supportedByX402Express: false,
      usdcTokenAddress: process.env.USDC_SOLANA_DEVNET_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    },
  ];
}

/**
 * Get all supported EVM networks
 */
export const getSupportedEvmNetworks = (): NetworkConfig[] => {
  const config = getNetworkConfiguration();
  return config.supportedNetworks.filter(network => network.type === 'evm');
};

/**
 * Get all supported Solana networks
 */
export const getSupportedSolanaNetworks = (): NetworkConfig[] => {
  const config = getNetworkConfiguration();
  return config.supportedNetworks.filter(network => network.type === 'solana');
};

/**
 * Get networks supported by x402-express middleware
 */
export const getX402ExpressSupportedNetworks = (): NetworkConfig[] => {
  const config = getNetworkConfiguration();
  return config.supportedNetworks.filter(network => network.supportedByX402Express);
};

/**
 * Get network configuration by name
 */
export const getNetworkByName = (name: string): NetworkConfig | undefined => {
  const config = getNetworkConfiguration();
  return config.supportedNetworks.find(network => 
    network.name.toLowerCase() === name.toLowerCase()
  );
};

/**
 * Check if a network is supported
 */
export const isNetworkSupported = (name: string): boolean => {
  return !!getNetworkByName(name);
};

/**
 * Get default network for a specific type
 */
export const getDefaultNetwork = (type: 'evm' | 'solana'): string => {
  const config = getNetworkConfiguration();
  return type === 'evm' ? config.defaultEvmNetwork : config.defaultSolanaNetwork;
};

/**
 * Validate network name and return normalized name
 */
export const validateAndNormalizeNetwork = (networkName?: string): string => {
  if (!networkName) {
    return getDefaultNetwork('evm');
  }

  const network = getNetworkByName(networkName);
  if (!network) {
    console.warn(`Unsupported network: ${networkName}, falling back to default`);
    return getDefaultNetwork('evm');
  }

  return network.name;
};