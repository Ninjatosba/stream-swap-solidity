// DEX configuration for different networks
export const DEX_CONFIG = {
    // Mainnet
    mainnet: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    },
    // Sepolia testnet
    sepolia: {
        type: "uniswap-v2",
        factory: "0x7E0987E5b3a30e3f2828572Bb659A548460a3003", // Sepolia Uniswap V2 Factory
        router: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008", // Sepolia Uniswap V2 Router
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
        type: "pancake",
        factory: "0x82438CE666d9403e488bA720c7424434e8Aa47CD", // PancakeFactory
        router: "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1", // PancakeRouter
    },
    // Base Sepolia testnet
    baseSepolia: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Base Sepolia Uniswap V2 Factory
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Base Sepolia Uniswap V2 Router
    },
};

export function getDexConfig(network: string) {
    const config = DEX_CONFIG[network as keyof typeof DEX_CONFIG];
    if (!config) {
        throw new Error(`DEX configuration not found for network: ${network}`);
    }
    return config;
}

// Legacy function for backward compatibility
export function getUniswapV2Addresses(network: string) {
    const config = getDexConfig(network);
    return {
        factory: config.factory,
        router: config.router,
    };
} 