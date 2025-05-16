import { task } from "hardhat/config";
import { parseEther } from "ethers";
import { ERC20Mock } from "../typechain-types";

task("mint-tokens", "Mints tokens to test accounts")
    .setAction(async (_, hre) => {
        const { deployments, ethers, getNamedAccounts } = hre;

        try {
            // Get accounts using the same pattern as deploy-factory.ts
            const { deployer, creator, subscriber1, subscriber2 } = await getNamedAccounts();
            console.log(`Deployer: ${deployer}`);
            const deployerBalance = await ethers.provider.getBalance(deployer);
            console.log(`Deployer balance: ${deployerBalance}`);
            console.log(`Creator: ${creator}`);
            const creatorBalance = await ethers.provider.getBalance(creator);
            console.log(`Creator balance: ${creatorBalance}`);
            console.log(`Subscriber1: ${subscriber1}`);
            const subscriber1Balance = await ethers.provider.getBalance(subscriber1);
            console.log(`Subscriber1 balance: ${subscriber1Balance}`);
            console.log(`Subscriber2: ${subscriber2}`);
            const subscriber2Balance = await ethers.provider.getBalance(subscriber2);
            console.log(`Subscriber2 balance: ${subscriber2Balance}`);

            // Get existing token addresses
            console.log(`Getting existing token addresses...`);
            let inTokenDeployment, outTokenDeployment;
            try {
                inTokenDeployment = await deployments.get("InToken");
                outTokenDeployment = await deployments.get("OutToken");
            } catch (error) {
                console.error("Failed to get token deployments. Make sure you're connected to the right network and the tokens are deployed.");
                throw error;
            }

            console.log(`InToken at: ${inTokenDeployment.address}`);
            console.log(`OutToken at: ${outTokenDeployment.address}`);

            // Get contract instances with proper types
            const inTokenContract = await ethers.getContractAt("ERC20Mock", inTokenDeployment.address) as unknown as ERC20Mock;
            const outTokenContract = await ethers.getContractAt("ERC20Mock", outTokenDeployment.address) as unknown as ERC20Mock;

            // Get signers for the accounts
            const deployerSigner = await ethers.getSigner(deployer);
            const creatorSigner = await ethers.getSigner(creator);
            const subscriber1Signer = await ethers.getSigner(subscriber1);
            const subscriber2Signer = await ethers.getSigner(subscriber2);

            // Mint tokens
            console.log("Minting in tokens for testing...");
            const inTokenMintAmount = parseEther("1000000"); // 1 million tokens for testing
            const inTokenMintTx = await inTokenContract.connect(deployerSigner).mint(subscriber1, inTokenMintAmount);
            await inTokenMintTx.wait();
            console.log(`Minted ${inTokenMintAmount} in tokens to subscriber1`);

            console.log("Minting in tokens for testing...");
            const inTokenMintAmount2 = parseEther("1000000"); // 1 million tokens for testing
            const inTokenMintTx2 = await inTokenContract.connect(deployerSigner).mint(subscriber2, inTokenMintAmount2);
            await inTokenMintTx2.wait();
            console.log(`Minted ${inTokenMintAmount2} in tokens to subscriber2`);

            console.log("Minting out tokens for testing...");
            const outTokenMintAmount = parseEther("10000000");
            const outTokenMintTx = await outTokenContract.connect(deployerSigner).mint(creator, outTokenMintAmount);
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
        } catch (error) {
            console.error("Error in mint-tokens task:", error);
            throw error;
        }
    }); 