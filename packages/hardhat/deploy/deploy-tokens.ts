import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { defaultStreamConfig, StreamConfig } from "./config/stream-config";

/**
 * Deploys the ERC20 tokens needed for the Stream contract.
 * This script is intended for local development and testing.
 */
const deployTokens: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    try {
        // Get deployer account
        const { deployer } = await hre.getNamedAccounts();
        console.log(`Deployer address: ${deployer}`);

        let deployerBalance = await hre.ethers.provider.getBalance(deployer);
        console.log(`Deployer balance: ${deployerBalance}`);

        const { deploy } = hre.deployments;

        // Deploy inDenom token
        console.log(`Deploying inDenom token...`);
        const inDenomDeployment = await deploy("InDenomToken", {
            from: deployer,
            contract: "ERC20Mock", // Use ERC20Mock implementation
            args: [
                "StreamInDenom",
                "IN",
            ],
            log: true,
            autoMine: true, // Speed up deployment on local network
        });

        console.log(`InDenomToken deployed at: ${inDenomDeployment.address}`);

        // Deploy outDenom token
        console.log(`Deploying outDenom token...`);
        const outDenomDeployment = await deploy("OutDenomToken", {
            from: deployer,
            contract: "ERC20Mock", // Use ERC20Mock implementation
            args: [
                "StreamOutDenom",
                "OUT",
            ],
            log: true,
            autoMine: true, // Speed up deployment on local network
        });

        console.log(`OutDenomToken deployed at: ${outDenomDeployment.address}`);

        // Get contract instances
        const inDenomContract = await hre.ethers.getContractAt("ERC20Mock", inDenomDeployment.address);
        const outDenomContract = await hre.ethers.getContractAt("ERC20Mock", outDenomDeployment.address);

        // Mint some inDenom tokens for testing
        console.log("Minting inDenom tokens for testing...");
        const inDenomMintAmount = 1000000n; // 1 million tokens for testing
        const inDenomMintTx = await inDenomContract.mint(deployer, inDenomMintAmount);
        await inDenomMintTx.wait();
        console.log(`Minted ${inDenomMintAmount} inDenom tokens to deployer`);

        // Mint some outDenom tokens for testing
        console.log("Minting outDenom tokens for testing...");
        const outDenomMintAmount = 1000000n; // 1 million tokens for testing
        const outDenomMintTx = await outDenomContract.mint(deployer, outDenomMintAmount);
        await outDenomMintTx.wait();
        console.log(`Minted ${outDenomMintAmount} outDenom tokens to deployer`);

        // Mint some outDenom tokens for testing
        console.log("Minting outDenom tokens for testing...");
        const outDenomMintAmount2 = 1000000n; // 1 million tokens for testing
        const outDenomMintTx2 = await outDenomContract.mint("0x9aae2dc9a514dfd9f56657ace26ca66667d7a833", outDenomMintAmount2);
        await outDenomMintTx2.wait();
        console.log(`Minted ${outDenomMintAmount2} outDenom tokens to deployer`);

        return true;
    } catch (error: unknown) {
        console.error("Token deployment failed:", error instanceof Error ? error.message : error);
        throw error;
    }
};

// Add tags for selective deployment
deployTokens.tags = ['tokens'];

// Add a unique ID for the deployment script
deployTokens.id = 'deploy_tokens';

export default deployTokens;
