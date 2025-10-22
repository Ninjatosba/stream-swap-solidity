/**
 * Chain-specific configuration for StreamSwap deployments
 * This file centralizes all chain-specific settings including DEX providers,
 * pool wrapper configurations, and feature flags
 */

export type DexType = "uniswap-v2" | "uniswap-v3" | "pancakeswap-v2" | "sushiswap" | "aerodrome" | "none";

export interface DexConfigV2 {
    type: "uniswap-v2" | "pancakeswap-v2" | "sushiswap";
    factory: string;
    router: string;
}

export interface DexConfigV3 {
    type: "uniswap-v3";
    factory: string;
    positionManager: string;
    defaultFee: number;
}

export interface DexConfigAerodrome {
    type: "aerodrome";
    factory: string;
    router: string;
    stable: boolean; // true for stable pools, false for volatile
}

export interface NoDexConfig {
    type: "none";
}

export type DexConfig = DexConfigV2 | DexConfigV3 | DexConfigAerodrome | NoDexConfig;

export interface PoolWrapperConfig {
    /** Enable V2 pool creation */
    enableV2: boolean;
    /** V2 DEX configuration (if enabled) */
    v2Config?: DexConfigV2;
    /** Enable V3 pool creation */
    enableV3: boolean;
    /** V3 DEX configuration (if enabled) */
    v3Config?: DexConfigV3;
    /** Aerodrome DEX configuration (if enabled) */
    aerodromeConfig?: DexConfigAerodrome;
}

export interface ChainConfig {
    /** Chain name */
    name: string;
    /** Chain ID */
    chainId: number;
    /** Whether this is a production network */
    isProduction: boolean;
    /** Whether this is a testnet */
    isTestnet: boolean;
    /** Pool wrapper configuration */
    poolWrappers: PoolWrapperConfig;
    /** Native token symbol (for logging) */
    nativeToken: string;
    /** Block explorer URL (optional) */
    blockExplorer?: string;
}

/**
 * Comprehensive chain configuration database
 */
export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
    // ============ Ethereum Networks ============
    mainnet: {
        name: "Ethereum Mainnet",
        chainId: 1,
        isProduction: true,
        isTestnet: false,
        nativeToken: "ETH",
        blockExplorer: "https://etherscan.io",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "uniswap-v2",
                factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
                router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            },
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x1F98431c8ad98523631AE4a59f267346ea31F984",
                positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
                defaultFee: 3000, // 0.3%
            },
        },
    },

    sepolia: {
        name: "Sepolia Testnet",
        chainId: 11155111,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        blockExplorer: "https://sepolia.etherscan.io",
        poolWrappers: {
            enableV2: false, // V2 not officially deployed on Sepolia
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c", // Official Sepolia V3 Factory
                positionManager: "0x1238536071E1c677A632429e3655c799b22cDA52", // Official Sepolia NFPM
                defaultFee: 3000, // 0.3%
            },
        },
    },

    // ============ Base Networks ============
    base: {
        name: "Base Mainnet",
        chainId: 8453,
        isProduction: true,
        isTestnet: false,
        nativeToken: "ETH",
        blockExplorer: "https://basescan.org",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "uniswap-v2",
                factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", // Base Uniswap V2
                router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
            },
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
                positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
                defaultFee: 3000,
            },
        },
    },


    baseSepolia: {
        name: "Base Sepolia Testnet",
        chainId: 84532,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        blockExplorer: "https://sepolia.basescan.org",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "uniswap-v2",
                factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
                router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            },
            enableV3: false, // Disabled for testnet
            // Enable Aerodrome for testing on Base Sepolia
            aerodromeConfig: {
                type: "aerodrome",
                factory: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual Aerodrome testnet factory
                router: "0x0000000000000000000000000000000000000000",   // TODO: Replace with actual Aerodrome testnet router
                stable: false // Default to volatile pools for testing
            }
        },
    },


    // ============ Arbitrum Networks ============
    arbitrum: {
        name: "Arbitrum One",
        chainId: 42161,
        isProduction: true,
        isTestnet: false,
        nativeToken: "ETH",
        blockExplorer: "https://arbiscan.io",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "sushiswap",
                factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4", // SushiSwap on Arbitrum
                router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
            },
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x1F98431c8ad98523631AE4a59f267346ea31F984",
                positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
                defaultFee: 3000,
            },
        },
    },

    arbitrumSepolia: {
        name: "Arbitrum Sepolia",
        chainId: 421614,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        blockExplorer: "https://sepolia.arbiscan.io",
        poolWrappers: {
            enableV2: false, // No DEX on testnet
            enableV3: false,
        },
    },

    // ============ Optimism Networks ============
    optimism: {
        name: "Optimism Mainnet",
        chainId: 10,
        isProduction: true,
        isTestnet: false,
        nativeToken: "ETH",
        blockExplorer: "https://optimistic.etherscan.io",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "uniswap-v2",
                factory: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
                router: "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2",
            },
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x1F98431c8ad98523631AE4a59f267346ea31F984",
                positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
                defaultFee: 3000,
            },
        },
    },

    optimismSepolia: {
        name: "Optimism Sepolia",
        chainId: 11155420,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        blockExplorer: "https://sepolia-optimism.etherscan.io",
        poolWrappers: {
            enableV2: false,
            enableV3: false,
        },
    },

    // ============ Polygon Networks ============
    polygon: {
        name: "Polygon Mainnet",
        chainId: 137,
        isProduction: true,
        isTestnet: false,
        nativeToken: "MATIC",
        blockExplorer: "https://polygonscan.com",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "uniswap-v2",
                factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32", // QuickSwap
                router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
            },
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x1F98431c8ad98523631AE4a59f267346ea31F984",
                positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
                defaultFee: 3000,
            },
        },
    },

    polygonMumbai: {
        name: "Polygon Mumbai",
        chainId: 80001,
        isProduction: false,
        isTestnet: true,
        nativeToken: "MATIC",
        blockExplorer: "https://mumbai.polygonscan.com",
        poolWrappers: {
            enableV2: false,
            enableV3: false,
        },
    },

    // ============ BNB Chain Networks ============
    bsc: {
        name: "BNB Smart Chain",
        chainId: 56,
        isProduction: true,
        isTestnet: false,
        nativeToken: "BNB",
        blockExplorer: "https://bscscan.com",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "pancakeswap-v2",
                factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
                router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
            },
            enableV3: true,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865", // PancakeSwap V3
                positionManager: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
                defaultFee: 2500, // 0.25% - PancakeSwap's most common fee
            },
        },
    },

    bscTestnet: {
        name: "BNB Chain Testnet",
        chainId: 97,
        isProduction: false,
        isTestnet: true,
        nativeToken: "BNB",
        blockExplorer: "https://testnet.bscscan.com",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "pancakeswap-v2",
                factory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
                router: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
            },
            enableV3: false,
        },
    },

    // ============ Monad Network ============
    monadTestnet: {
        name: "Monad Testnet",
        chainId: 10143,
        isProduction: false,
        isTestnet: true,
        nativeToken: "MONAD",
        blockExplorer: "https://explorer.testnet.monad.xyz",
        poolWrappers: {
            enableV2: true,
            v2Config: {
                type: "uniswap-v2",
                factory: "0x82438CE666d9403e488bA720c7424434e8Aa47CD",
                router: "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1",
            },
            enableV3: false, // No V3 on Monad yet
        },
    },

    // ============ Hyperliquid Network ============
    hyperEvmTestnet: {
        name: "Hyperliquid EVM Testnet",
        chainId: 998,
        isProduction: false,
        isTestnet: true,
        nativeToken: "HYPE",
        blockExplorer: "https://explorer.hyperliquid-testnet.xyz",
        poolWrappers: {
            enableV2: false, // No DEX deployed yet
            enableV3: false,
        },
    },

    // ============ Cosmos EVM Networks ============
    cosmosEvmDevnet: {
        name: "Cosmos EVM Devnet",
        chainId: 9000,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ATOM",
        poolWrappers: {
            enableV2: false, // Development network - no public DEX
            enableV3: false,
        },
    },

    // ============ Local Development Networks ============
    hardhat: {
        name: "Hardhat Local",
        chainId: 31337,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        poolWrappers: {
            enableV2: false, // Pools deployed via fork in tests
            enableV3: false,
        },
    },

    localhost: {
        name: "Localhost",
        chainId: 31337,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        poolWrappers: {
            enableV2: false, // Pools deployed manually
            enableV3: false,
        },
    },

    localCevm: {
        name: "Local CEVM",
        chainId: 7001,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        poolWrappers: {
            enableV2: false,
            enableV3: false,
        },
    },
};

/**
 * Get chain configuration for a given network
 * @param network - Network name (e.g., "mainnet", "sepolia", "base")
 * @returns Chain configuration
 * @throws Error if network is not found
 */
export function getChainConfig(network: string): ChainConfig {
    // Handle default network
    if (network === "default") {
        return CHAIN_CONFIGS.hardhat;
    }

    const config = CHAIN_CONFIGS[network];
    if (!config) {
        throw new Error(
            `Chain configuration not found for network: ${network}. ` +
            `Available networks: ${Object.keys(CHAIN_CONFIGS).join(", ")}`
        );
    }

    return config;
}

/**
 * Check if pool creation is enabled for a network
 * @param network - Network name
 * @returns true if any pool wrapper is enabled
 */
export function isPoolCreationEnabled(network: string): boolean {
    const config = getChainConfig(network);
    return config.poolWrappers.enableV2 || config.poolWrappers.enableV3;
}

/**
 * Get V2 pool wrapper address or zero address if disabled
 * @param network - Network name
 * @returns V2 config or undefined if disabled
 */
export function getV2Config(network: string): DexConfigV2 | undefined {
    const config = getChainConfig(network);
    return config.poolWrappers.enableV2 ? config.poolWrappers.v2Config : undefined;
}

/**
 * Get V3 pool wrapper address or zero address if disabled
 * @param network - Network name
 * @returns V3 config or undefined if disabled
 */
export function getV3Config(network: string): DexConfigV3 | undefined {
    const config = getChainConfig(network);
    return config.poolWrappers.enableV3 ? config.poolWrappers.v3Config : undefined;
}

/**
 * Get Aerodrome pool wrapper address or zero address if disabled
 * @param network - Network name
 * @returns Aerodrome config or undefined if disabled
 */
export function getAerodromeConfig(network: string): DexConfigAerodrome | undefined {
    // For now, we'll use hardcoded Aerodrome addresses for Base networks
    // In the future, this could be expanded to support multiple Aerodrome deployments
    if (network === "base" || network === "baseAerodrome") {
        return {
            type: "aerodrome",
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40DaB", // Aerodrome Factory on Base
            router: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",  // Aerodrome Router on Base
            stable: false // Default to volatile pools
        };
    } else if (network === "baseSepolia" || network === "baseSepoliaAerodrome") {
        return {
            type: "aerodrome",
            factory: "0x0000000000000000000000000000000000000000", // Placeholder - need actual testnet address
            router: "0x0000000000000000000000000000000000000000",   // Placeholder - need actual testnet address
            stable: false // Default to volatile pools
        };
    }
    return undefined;
}

/**
 * Print deployment summary for a network
 * @param network - Network name
 */
export function printChainSummary(network: string): void {
    const config = getChainConfig(network);
    console.log("\n" + "=".repeat(60));
    console.log(`Chain: ${config.name} (${network})`);
    console.log(`Chain ID: ${config.chainId}`);
    console.log(`Native Token: ${config.nativeToken}`);
    console.log(`Environment: ${config.isProduction ? "PRODUCTION" : "TESTNET"}`);
    console.log("-".repeat(60));
    console.log("Pool Creation Configuration:");
    console.log(`  V2 Pool Wrapper: ${config.poolWrappers.enableV2 ? "ENABLED" : "DISABLED"}`);
    if (config.poolWrappers.enableV2 && config.poolWrappers.v2Config) {
        console.log(`    Type: ${config.poolWrappers.v2Config.type}`);
        console.log(`    Factory: ${config.poolWrappers.v2Config.factory}`);
        console.log(`    Router: ${config.poolWrappers.v2Config.router}`);
    }
    console.log(`  V3 Pool Wrapper: ${config.poolWrappers.enableV3 ? "ENABLED" : "DISABLED"}`);
    if (config.poolWrappers.enableV3 && config.poolWrappers.v3Config) {
        console.log(`    Type: ${config.poolWrappers.v3Config.type}`);
        console.log(`    Factory: ${config.poolWrappers.v3Config.factory}`);
        console.log(`    Position Manager: ${config.poolWrappers.v3Config.positionManager}`);
        console.log(`    Default Fee: ${config.poolWrappers.v3Config.defaultFee / 10000}%`);
    }
    if (!config.poolWrappers.enableV2 && !config.poolWrappers.enableV3) {
        console.log("  ⚠️  No pool wrappers enabled - pool creation disabled");
    }
    console.log("=".repeat(60) + "\n");
}

