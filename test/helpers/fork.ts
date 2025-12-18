import { ethers } from "hardhat";

export async function enableMainnetFork(blockNumber?: number, network?: string) {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) throw new Error("Missing ALCHEMY_API_KEY for fork");
    let jsonRpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

    if (network === "base" || network === "baseAerodrome") {
        jsonRpcUrl = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
    } else if (network === "baseSepolia") {
        jsonRpcUrl = `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
    }
    // Always reset to ensure fork is properly enabled (even if env var is set,
    // a previous test's after() hook may have called disableFork())
    await ethers.provider.send("hardhat_reset", [
        {
            forking: {
                jsonRpcUrl,
                blockNumber,
            },
        },
    ]);
}

export async function disableFork() {
    await ethers.provider.send("hardhat_reset", [{}]);
}



