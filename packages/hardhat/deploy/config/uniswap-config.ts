// Uniswap V2 addresses for different networks
export const UNISWAP_V2_ADDRESSES = {
    // Mainnet
    mainnet: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    },
    // Sepolia testnet
    sepolia: {
        factory: "0x7E0987E5b3a30e3f2828572Bb659A548460a3003", // Sepolia Uniswap V2 Factory
        router: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008", // Sepolia Uniswap V2 Router
    },
    // Local development (using mock addresses for now)
    localCevm: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Cosmos EVM devnet
    cosmosEvmDevnet: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Hyperliquid testnet
    hyperliquidTestnet: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Local hardhat
    hardhat: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Localhost
    localhost: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
    // Monad testnet
    monadTestnet: {
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Mock address
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Mock address
    },
};

export function getUniswapV2Addresses(network: string) {
    const addresses = UNISWAP_V2_ADDRESSES[network as keyof typeof UNISWAP_V2_ADDRESSES];
    if (!addresses) {
        throw new Error(`Uniswap V2 addresses not configured for network: ${network}`);
    }
    return addresses;
} 