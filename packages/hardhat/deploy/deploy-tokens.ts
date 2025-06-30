import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { parseEther } from "ethers";

/**
 * Deploys the ERC20 tokens needed for the Stream contract.
 * This script is intended for local development and testing.
 */
const deployTokens: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    // Get deployer account
    const { deployer, creator, subscriber1, subscriber2 } = await hre.getNamedAccounts();
    console.log(`Deployer address: ${deployer}`);
    console.log(`Creator address: ${creator}`);
    console.log(`Subscriber1 address: ${subscriber1}`);
    console.log(`Subscriber2 address: ${subscriber2}`);

    const deployerBalance = await hre.ethers.provider.getBalance(deployer);
    console.log(`Deployer balance: ${deployerBalance}`);

    const { deploy } = hre.deployments;

    // Deploy or get existing in token
    console.log(`Deploying or getting in token...`);
    const inTokenDeployment = await deploy("InToken", {
      from: deployer,
      contract: "ERC20Mock",
      args: ["StreamInToken", "STI"],
      log: true,
      autoMine: true,
    });

    console.log(`InToken at: ${inTokenDeployment.address}`);

    // Deploy or get existing out token
    console.log(`Deploying or getting out token...`);
    const outTokenDeployment = await deploy("OutToken", {
      from: deployer,
      contract: "ERC20Mock",
      args: ["StreamOutToken", "STO"],
      log: true,
      autoMine: true,
    });

    console.log(`OutToken at: ${outTokenDeployment.address}`);

    // Deploy or get existing stream creation fee token
    console.log(`Deploying or getting stream creation fee token...`);
    const streamCreationFeeTokenDeployment = await deploy("StreamCreationFeeToken", {
      from: deployer,
      contract: "ERC20Mock",
      args: ["StreamCreationFeeToken", "SFT"],
      log: true,
      autoMine: true,
    });

    // Get contract instances
    const inTokenContract = await hre.ethers.getContractAt("ERC20Mock", inTokenDeployment.address);
    const outTokenContract = await hre.ethers.getContractAt("ERC20Mock", outTokenDeployment.address);
    const streamCreationFeeTokenContract = await hre.ethers.getContractAt(
      "ERC20Mock",
      streamCreationFeeTokenDeployment.address,
    );

    // Mint stream creation fee tokens only stream creator needs it
    console.log("Minting stream creation fee tokens...");
    const streamCreationFeeTokenMintAmount = parseEther("1000000");
    const streamCreationFeeTokenMintTx = await streamCreationFeeTokenContract.mint(
      creator,
      streamCreationFeeTokenMintAmount,
    );
    await streamCreationFeeTokenMintTx.wait();
    console.log(`Minted ${streamCreationFeeTokenMintAmount} stream creation fee tokens to deployer`);

    // Always mint tokens regardless of deployment status
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
    return true;
  } catch (error: unknown) {
    console.error("Token deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

// Add tags for selective deployment
deployTokens.tags = ["tokens"];

// Add a unique ID for the deployment script
deployTokens.id = "deploy_tokens";

export default deployTokens;
