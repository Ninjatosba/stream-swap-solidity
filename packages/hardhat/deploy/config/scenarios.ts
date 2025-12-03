export type ScenarioId = "core-mainnet" | "core-testnet" | "full-dev";

// ===== DEX / Pool wrapper types (inlined from old chain-config for single-file config) =====

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

/** Stream implementation configuration */
export interface StreamImplementationConfig {
    enableBasic: boolean;
    enablePostActions: boolean;
}

export interface NetworkConfig {
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
    /** Stream implementation configuration */
    streamImplementations: StreamImplementationConfig;
    /** Whether to deploy and enable VestingFactory */
    enableVesting?: boolean;
    /** Native token symbol (for logging) */
    nativeToken: string;
    /** Block explorer URL (optional) */
    blockExplorer?: string;
    /** Which deployment scenario this network should use by default */
    scenario: ScenarioId;
    /** Optional accepted in-tokens override for this network */
    acceptedInTokens?: string[];
}

export interface ScenarioConfig {
    /** Scenario identifier */
    id: ScenarioId;
    /** Human readable name */
    title: string;
    /** Description for logs / docs */
    description: string;

    /**
     * Whether this scenario should deploy local/test tokens.
     * On production networks this should normally be false.
     */
    deployTokens: boolean;

    /**
     * Whether to mint large test balances to named accounts.
     * Only meaningful when deployTokens = true.
     */
    mintTestBalances: boolean;

    /**
     * Whether StreamFactory should use the production-tuned configuration
     * (longer durations, higher fees etc.).
     */
    useProductionFactoryConfig: boolean;

    /**
     * Whether the StreamFactory configuration expects a locally deployed
     * "InToken" (dev/test token) and will fail if it is missing.
     */
    requireDevInToken: boolean;

    /**
     * Optional list of accepted in-tokens for the factory.
     * If undefined, the deploy script will fall back to a sensible default.
     *
     * NOTE: This list should already include the zero-address when the native
     * token should be accepted.
     */
    acceptedInTokens?: string[];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Monad USDC-like token used in existing deployments.
// This preserves the previous behaviour where a single hard-coded address
// was used for production-style configurations.
const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

/**
 * Base scenario definitions that are network agnostic.
 * Per-network overrides (like acceptedInTokens) are applied on top.
 */
const SCENARIOS_BASE: Record<ScenarioId, Omit<ScenarioConfig, "id">> = {
    "core-mainnet": {
        title: "Core Mainnet",
        description:
            "Production-style deployment using existing tokens and infrastructure. " +
            "No local token deployments or test balances.",
        deployTokens: false,
        mintTestBalances: false,
        useProductionFactoryConfig: true,
        requireDevInToken: false,
    },
    "core-testnet": {
        title: "Core Testnet",
        description:
            "Deploy core contracts and a minimal environment suitable for public testnets.",
        deployTokens: true,
        mintTestBalances: true,
        useProductionFactoryConfig: false,
        requireDevInToken: true,
    },
    "full-dev": {
        title: "Full Development Environment",
        description:
            "Deploy all supporting contracts and test tokens for local development or forks.",
        deployTokens: true,
        mintTestBalances: true,
        useProductionFactoryConfig: false,
        requireDevInToken: true,
    },
};

/**
 * Unified per-network configuration.
 * This replaces the old chain-config + scattered mappings so that
 * everything relevant to a network lives in a single place.
 */
export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
    // ============ Ethereum Networks ============
    mainnet: {
        name: "Ethereum Mainnet",
        chainId: 1,
        isProduction: true,
        isTestnet: false,
        nativeToken: "ETH",
        blockExplorer: "https://etherscan.io",
        scenario: "core-mainnet",
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
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
    },
    sepolia: {
        name: "Sepolia Testnet",
        chainId: 11155111,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        blockExplorer: "https://sepolia.etherscan.io",
        scenario: "core-testnet",
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
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
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
        scenario: "core-mainnet",
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
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
    },
    baseSepolia: {
        name: "Base Sepolia Testnet",
        chainId: 84532,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        blockExplorer: "https://sepolia.basescan.org",
        scenario: "core-testnet",
        poolWrappers: {
            enableV2: false, // V2 not deployed on Base Sepolia
            enableV3: false,
            v3Config: {
                type: "uniswap-v3",
                factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // Official Base Sepolia V3 Factory
                positionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2", // Official Base Sepolia NFPM
                defaultFee: 3000, // 0.3%
            },
        },
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
        enableVesting: false, // Vesting not required on this network
    },

    // ============ Monad Networks ============
    monadTestnet: {
        name: "Monad Testnet",
        chainId: 10143,
        isProduction: true,
        isTestnet: false,
        nativeToken: "MONAD",
        blockExplorer: "https://explorer.testnet.monad.xyz",
        scenario: "core-mainnet", // treated as pre-production
        poolWrappers: {
            enableV2: false,
            enableV3: false, // No V3 on Monad yet
        },
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
        acceptedInTokens: [ZERO_ADDRESS, MONAD_USDC],
    },
    monadMainnet: {
        name: "Monad Mainnet",
        chainId: 10143,
        isProduction: true,
        isTestnet: false,
        nativeToken: "MONAD",
        blockExplorer: "https://explorer.monad.xyz",
        scenario: "core-mainnet",
        poolWrappers: {
            enableV2: false,
            enableV3: false,
        },
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
        acceptedInTokens: [ZERO_ADDRESS, MONAD_USDC],
    },

    // ============ Hyperliquid Network ============
    hyperEvmTestnet: {
        name: "Hyperliquid EVM Testnet",
        chainId: 998,
        isProduction: false,
        isTestnet: true,
        nativeToken: "HYPE",
        blockExplorer: "https://explorer.hyperliquid-testnet.xyz",
        scenario: "core-testnet",
        poolWrappers: {
            enableV2: false, // No DEX deployed yet
            enableV3: false,
        },
        streamImplementations: {
            enableBasic: true, // Required for stream creation
            enablePostActions: false,
        },
        enableVesting: false, // Vesting not required on this network
    },

    // ============ Local Development Networks ============
    hardhat: {
        name: "Hardhat Local",
        chainId: 31337,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        scenario: "full-dev",
        poolWrappers: {
            enableV2: false, // Pools deployed via fork in tests
            enableV3: false,
        },
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
    },
    localhost: {
        name: "Localhost",
        chainId: 31337,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        scenario: "full-dev",
        poolWrappers: {
            enableV2: false, // Pools deployed manually
            enableV3: false,
        },
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
    },
    localCevm: {
        name: "Local CEVM",
        chainId: 7001,
        isProduction: false,
        isTestnet: true,
        nativeToken: "ETH",
        scenario: "full-dev",
        poolWrappers: {
            enableV2: false,
            enableV3: false,
        },
        streamImplementations: {
            enableBasic: true,
            enablePostActions: false,
        },
    },
};

export function getNetworkConfig(network: string): NetworkConfig {
    // Handle default network
    if (network === "default") {
        return NETWORK_CONFIGS.hardhat;
    }

    const config = NETWORK_CONFIGS[network];
    if (!config) {
        throw new Error(
            `Network configuration not found for: ${network}. ` +
            `Available networks: ${Object.keys(NETWORK_CONFIGS).join(", ")}`,
        );
    }
    return config;
}

/**
 * Resolve the scenario id for the given network. If no explicit mapping
 * exists, fall back based on the chain configuration flags.
 */
export function getScenarioId(network: string): ScenarioId {
    // 1) Optional explicit override via --scenario CLI flag (set via Hardhat task parameter).
    const override = process.env.DEPLOY_SCENARIO as ScenarioId | undefined;
    if (override) {
        if (override === "core-mainnet" || override === "core-testnet" || override === "full-dev") {
            return override;
        }
        console.warn(`⚠️  Invalid scenario "${override}". Valid options: core-mainnet, core-testnet, full-dev. Using network default.`);
    }

    // 2) Use the network configuration as the single source of truth.
    return getNetworkConfig(network).scenario;
}

/**
 * Get the resolved scenario configuration for a network.
 */
export function getScenarioConfig(network: string): ScenarioConfig {
    const id = getScenarioId(network);
    const base = SCENARIOS_BASE[id];
    const networkConfig = getNetworkConfig(network);
    const acceptedInTokens = networkConfig.acceptedInTokens;

    return {
        id,
        ...base,
        ...(acceptedInTokens ? { acceptedInTokens } : {}),
    };
}

// ===== Helper views used by deployment scripts (previously in chain-config) =====

export function isPoolCreationEnabled(network: string): boolean {
    const config = getNetworkConfig(network);
    return config.poolWrappers.enableV2 || config.poolWrappers.enableV3;
}

export function getV2Config(network: string): DexConfigV2 | undefined {
    const config = getNetworkConfig(network);
    return config.poolWrappers.enableV2 ? config.poolWrappers.v2Config : undefined;
}

export function getV3Config(network: string): DexConfigV3 | undefined {
    const config = getNetworkConfig(network);
    return config.poolWrappers.enableV3 ? config.poolWrappers.v3Config : undefined;
}

export function getAerodromeConfig(network: string): DexConfigAerodrome | undefined {
    const config = getNetworkConfig(network);

    // If a specific Aerodrome config is provided, use it directly.
    if (config.poolWrappers.aerodromeConfig) {
        return config.poolWrappers.aerodromeConfig;
    }

    // Backwards-compatible default: Aerodrome on Base mainnet only.
    if (network === "base" || network === "baseAerodrome") {
        return {
            type: "aerodrome",
            factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40DaB", // Aerodrome Factory on Base
            router: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",  // Aerodrome Router on Base
            stable: false, // Default to volatile pools
        };
    }

    return undefined;
}

export function printChainSummary(network: string): void {
    const config = getNetworkConfig(network);
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


