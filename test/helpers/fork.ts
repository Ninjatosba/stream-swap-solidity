import { ethers } from "hardhat";

export async function enableMainnetFork(blockNumber?: number, network?: string) {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) throw new Error("Missing ALCHEMY_API_KEY for fork");
    let jsonRpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

    if (network === "base") {
        jsonRpcUrl = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
    } else if (network === "baseSepolia") {
        jsonRpcUrl = `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
    }
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



