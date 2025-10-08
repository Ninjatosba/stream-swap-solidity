import { ethers } from "hardhat";

export async function enableMainnetFork(blockNumber?: number) {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) throw new Error("Missing ALCHEMY_API_KEY for fork");
    const jsonRpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;
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



