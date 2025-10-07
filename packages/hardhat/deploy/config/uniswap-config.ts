// DEX configuration for different networks
export type DexConfigV2 = {
    type: "uniswap-v2" | "pancake";
    factory: string;
    router: string;
};

export type DexConfigV3 = {
    type: "uniswap-v3";
    factory: string;
    positionManager: string;
    defaultFee: number;
};

export type DexConfig = DexConfigV2 | DexConfigV3;

export const DEX_CONFIG: Record<string, DexConfig> = {
    // Mainnet
    mainnet: {
        type: "uniswap-v3",
        factory: "0x1F98431c8ad98523631AE4a59f267346ea31F984",
        positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        defaultFee: 3000,
    },
    // Sepolia testnet
    sepolia: {
        type: "uniswap-v3",
        factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984", // Uniswap V3 Factory (lowercase to bypass checksum strictness)
        positionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88", // NFPM (lowercase)
        defaultFee: 3000,
    },
    // Local development (using mock addresses for now)
    localCevm: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Cosmos EVM devnet
    cosmosEvmDevnet: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Hyperliquid testnet
    hyperEvmTestnet: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Local hardhat
    hardhat: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Localhost
    localhost: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Monad testnet
    monadTestnet: {
        type: "uniswap-v2",
        factory: "0x82438CE666d9403e488bA720c7424434e8Aa47CD", // Factory (v2-like)
        router: "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1", // Router (v2-like)
    },
    // Base Sepolia testnet
    baseSepolia: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Base Sepolia Uniswap V2 Factory
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Base Sepolia Uniswap V2 Router
    },
};

export function getDexConfig(network: string): DexConfig {
    const config = DEX_CONFIG[network as keyof typeof DEX_CONFIG];
    if (network === "default") {
        return DEX_CONFIG.hardhat;
    }
    if (!config) {
        throw new Error(`DEX configuration not found for network: ${network}`);
    }
    return config;
}

// Legacy function for backward compatibility
export function getUniswapV2Addresses(network: string) {
    const config = getDexConfig(network) as DexConfigV2;
    return {
        factory: config.factory,
        router: config.router,
    };
} 