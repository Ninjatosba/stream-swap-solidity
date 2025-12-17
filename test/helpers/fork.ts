import { ethers } from "hardhat";

export async function enableMainnetFork(blockNumber?: number, network?: string) {
    // If forking is already enabled in config, don't do hardhat_reset
    if (process.env.MAINNET_FORKING_ENABLED === 'true') {
        return;
    }

    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) throw new Error("Missing ALCHEMY_API_KEY for fork");
    let jsonRpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

    if (network === "base") {
        jsonRpcUrl = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
    } else if (network === "baseSepolia") {
        jsonRpcUrl = `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
    }
    // Single reset directly into fork mode (avoid extra reset/snapshots on EDR)
    await ethers.provider.send("hardhat_reset", [
        {
            forking: {
                jsonRpcUrl,
                blockNumber,
            },
        },
    ]);
    // Note: Don't call hardhat_setNextBlockBaseFeePerGas on fork - EDR doesn't support it
}

export async function disableFork() {
    await ethers.provider.send("hardhat_reset", [{}]);
}



