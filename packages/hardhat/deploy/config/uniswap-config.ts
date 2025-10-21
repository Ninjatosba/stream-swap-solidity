/**
 * DEPRECATED: This file is kept for backward compatibility only.
 * Please use chain-config.ts for all new deployments.
 * 
 * This file re-exports functionality from chain-config.ts
 */

import {
    getChainConfig,
    getV2Config as getV2ConfigNew,
    getV3Config as getV3ConfigNew,
    DexConfigV2 as DexConfigV2New,
    DexConfigV3 as DexConfigV3New
} from "./chain-config";

export type DexConfigV2 = DexConfigV2New;
export type DexConfigV3 = DexConfigV3New;
export type DexConfig = DexConfigV2 | DexConfigV3;

/**
 * @deprecated Use getChainConfig from chain-config.ts instead
 */
export function getDexConfig(network: string): DexConfig {
    console.warn("⚠️  getDexConfig is deprecated. Use getChainConfig from chain-config.ts instead.");

    const chainConfig = getChainConfig(network);

    // Return V3 if available, otherwise V2, otherwise throw
    if (chainConfig.poolWrappers.enableV3 && chainConfig.poolWrappers.v3Config) {
        return chainConfig.poolWrappers.v3Config;
    } else if (chainConfig.poolWrappers.enableV2 && chainConfig.poolWrappers.v2Config) {
        return chainConfig.poolWrappers.v2Config;
    } else {
        throw new Error(`No DEX configuration available for network: ${network}`);
    }
}

/**
 * @deprecated Use getV2Config from chain-config.ts instead
 */
export function getUniswapV2Addresses(network: string) {
    console.warn("⚠️  getUniswapV2Addresses is deprecated. Use getV2Config from chain-config.ts instead.");

    const v2Config = getV2ConfigNew(network);
    if (!v2Config) {
        throw new Error(`No V2 configuration available for network: ${network}`);
    }

    return {
        factory: v2Config.factory,
        router: v2Config.router,
    };
}

/**
 * Legacy DEX_CONFIG for backward compatibility
 * @deprecated Use CHAIN_CONFIGS from chain-config.ts instead
 */
export const DEX_CONFIG: Record<string, DexConfig> = {
    mainnet: {
        type: "uniswap-v3",
        factory: "0x1F98431c8ad98523631AE4a59f267346ea31F984",
        positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        defaultFee: 3000,
    },
    sepolia: {
        type: "uniswap-v3",
        factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
        positionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
        defaultFee: 3000,
    },
    hardhat: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    },
    localhost: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    },
    monadTestnet: {
        type: "uniswap-v2",
        factory: "0x82438CE666d9403e488bA720c7424434e8Aa47CD",
        router: "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1",
    },
    baseSepolia: {
        type: "uniswap-v2",
        factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    },
};
