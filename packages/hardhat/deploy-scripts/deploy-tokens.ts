import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { parseEther } from "ethers";
import { getScenarioConfig } from "../deploy/config/scenarios";

/**
 * Deploys the ERC20 tokens needed for the Stream contract.
 *
 * This script is scenario-aware:
 * - On mainnet / production-style scenarios it will NO-OP and rely on
 *   externally provided token addresses.
 * - On testnets / local dev it will deploy mock tokens and mint balances.
 */
const deployTokens: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const network = hre.network.name;
    const scenario = getScenarioConfig(network);

    if (!scenario.deployTokens) {
      console.log(
        `\n⏭️  Skipping token deployment for network "${network}" (scenario: ${scenario.id} - ${scenario.title})`,
      );
      console.log(
        "    Expecting accepted tokens to be configured externally for this network.\n",
      );
      return true;
    }

    console.log(
      `\n📦 Deploying mock tokens for network "${network}" (scenario: ${scenario.id} - ${scenario.title})`,
    );

    // Get deployer / test accounts if they exist in the named accounts config.
    const { deployer, creator, subscriber1, subscriber2 } = await hre.getNamedAccounts();
    console.log(`Deployer address: ${deployer}`);
    if (creator) console.log(`Creator address: ${creator}`);
    if (subscriber1) console.log(`Subscriber1 address: ${subscriber1}`);
    if (subscriber2) console.log(`Subscriber2 address: ${subscriber2}`);

    const deployerBalance = await hre.ethers.provider.getBalance(deployer);
    console.log(`Deployer balance: ${deployerBalance}`);

    const { deploy } = hre.deployments;

    // Deploy or get existing in token
    console.log(`Deploying or getting in token...`);
    const inTokenDeployment = await deploy("InToken", {
      from: deployer,
      contract: "ERC20Mock",
      args: ["ssUSD MONAD", "SSUSD"],
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

    // On some scenarios we may only want the contracts without funded test balances.
    if (!scenario.mintTestBalances) {
      console.log("Minting of test balances disabled for this scenario.");
      return true;
    }

    // Get contract instances
    const inTokenContract = await hre.ethers.getContractAt("ERC20Mock", inTokenDeployment.address);
    const outTokenContract = await hre.ethers.getContractAt(
      "ERC20Mock",
      outTokenDeployment.address,
    );

    // Mint test balances if we have the required accounts configured
    if (subscriber1) {
      console.log("Minting in tokens for testing (subscriber1)...");
      const inTokenMintAmount = parseEther("1000000"); // 1 million tokens for testing
      const inTokenMintTx = await inTokenContract.mint(subscriber1, inTokenMintAmount);
      await inTokenMintTx.wait();
      console.log(`Minted ${inTokenMintAmount} in tokens to subscriber1`);
    }

    if (subscriber2) {
      console.log("Minting in tokens for testing (subscriber2)...");
      const inTokenMintAmount2 = parseEther("1000000"); // 1 million tokens for testing
      const inTokenMintTx2 = await inTokenContract.mint(subscriber2, inTokenMintAmount2);
      await inTokenMintTx2.wait();
      console.log(`Minted ${inTokenMintAmount2} in tokens to subscriber2`);
    }

    if (creator) {
      console.log("Minting out tokens for testing (creator)...");
      const outTokenMintAmount = parseEther("10000000");
      const outTokenMintTx = await outTokenContract.mint(creator, outTokenMintAmount);
      await outTokenMintTx.wait();
      console.log(`Minted ${outTokenMintAmount} out tokens to creator`);
    }

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


