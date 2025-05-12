import { task } from "hardhat/config";
import { parseEther } from "ethers";
import { ERC20Mock } from "../typechain-types";

task("mint-tokens", "Mints tokens to test accounts")
    .setAction(async (_, hre) => {
        const { deployments, ethers } = hre;

        // Get accounts
        const { deployer, creator, subscriber1, subscriber2 } = await hre.getNamedAccounts();
        console.log(`Deployer address: ${deployer}`);
        console.log(`Creator address: ${creator}`);
        console.log(`Subscriber1 address: ${subscriber1}`);
        console.log(`Subscriber2 address: ${subscriber2}`);

        // Get existing token addresses
        console.log(`Getting existing token addresses...`);
        const inTokenDeployment = await deployments.get("InToken");
        const outTokenDeployment = await deployments.get("OutToken");

        console.log(`InToken at: ${inTokenDeployment.address}`);
        console.log(`OutToken at: ${outTokenDeployment.address}`);

        // Get contract instances with proper types
        const inTokenContract = await ethers.getContractAt("ERC20Mock", inTokenDeployment.address) as unknown as ERC20Mock;
        const outTokenContract = await ethers.getContractAt("ERC20Mock", outTokenDeployment.address) as unknown as ERC20Mock;

        // Mint tokens
        console.log("Minting in tokens for testing...");
        const inTokenMintAmount = parseEther("1000000"); // 1 million tokens for testing
        const inTokenMintTx = await inTokenContract.mint(subscriber1, inTokenMintAmount);
        await inTokenMintTx.wait();
        console.log(`Minted ${inTokenMintAmount} in tokens to subscriber1`);

        console.log("Minting in tokens for testing...");
        const inTokenMintAmount2 = parseEther("1000000"); // 1 million tokens for testing
        const inTokenMintTx2 = await inTokenContract.mint(subscriber2, inTokenMintAmount2);
        await inTokenMintTx2.wait();
        console.log(`Minted ${inTokenMintAmount2} in tokens to subscriber2`);

        console.log("Minting out tokens for testing...");
        const outTokenMintAmount = parseEther("10000000");
        const outTokenMintTx = await outTokenContract.mint(creator, outTokenMintAmount);
        await outTokenMintTx.wait();
        console.log(`Minted ${outTokenMintAmount} out tokens to creator`);

        // Log final balances
        const subscriber1InBalance = await inTokenContract.balanceOf(subscriber1);
        const subscriber2InBalance = await inTokenContract.balanceOf(subscriber2);
        const creatorOutBalance = await outTokenContract.balanceOf(creator);

        console.log("\nFinal Balances:");
        console.log(`Subscriber1 InToken balance: ${subscriber1InBalance}`);
        console.log(`Subscriber2 InToken balance: ${subscriber2InBalance}`);
        console.log(`Creator OutToken balance: ${creatorOutBalance}`);
    }); 