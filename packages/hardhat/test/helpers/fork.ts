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

    // Stabilize EIP-1559 base fee to avoid tx rejections in tests
    // Set next block base fee to 0 and mine one block
    try {
        await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x0"]);
        await ethers.provider.send("hardhat_mine", ["0x1"]);
    } catch (_) {
        // Ignore if method not supported by older Hardhat versions
    }
}

export async function disableFork() {
    await ethers.provider.send("hardhat_reset", [{}]);
}



