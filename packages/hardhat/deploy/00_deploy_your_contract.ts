import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { assert } from "chai";

/**
 * Deploys the Stream contract and a Mock ERC-20 Token contract for testing.
 */
const deployStreamContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    // Reset the local network first
    await hre.network.provider.send("hardhat_reset");

    // Keep automine enabled for deployments
    const { deployer } = await hre.getNamedAccounts();
    const { deploy } = hre.deployments;

    // Set initial block time
    const nowSeconds = (await hre.ethers.provider.getBlock("latest"))?.timestamp ?? 0;
    console.log(`Starting time: ${nowSeconds}`);

    let waitSeconds = 50;
    let bootstrappingDuration = 50;
    let streamDuration = 60;

    let bootstrappingStartTime = nowSeconds + waitSeconds;
    let streamStartTime = bootstrappingStartTime + bootstrappingDuration;
    let streamEndTime = streamStartTime + streamDuration;

    // Helper function to mine blocks with consistent time increments
    async function mineBlock(timestamp?: number) {
      if (timestamp) {
        await hre.ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
      }
      await hre.ethers.provider.send("evm_mine", []);
    }

    let streamOutAmount = 1000;

    // Deploy contracts with automine enabled
    const inDenom = await deploy("ERC20Mock", {
      from: deployer,
      args: ["InDenom Token", "IN"],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("InDenom Mock Token deployed at:", inDenom.address);

    // Deploy streamOutDenom ERC20 Mock token with explicit nonce
    const streamOutDenom = await deploy("ERC20Mock", {
      from: deployer,
      args: ["StreamOutDenom Token", "OUT"],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("StreamOutDenom Mock Token deployed at:", streamOutDenom.address);

    // Mint tokens for the deployer as the streamOutAmount
    const streamOutDenomContract = await hre.ethers.getContractAt("ERC20Mock", streamOutDenom.address);
    await streamOutDenomContract.mint(deployer, streamOutAmount);
    console.log(`Minted ${streamOutAmount} tokens for deployer`);

    // Deploy Stream contract with explicit nonce
    const stream = await deploy("Stream", {
      from: deployer,
      args: [],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("Stream contract deployed at:", stream.address);

    // Set up allowance for the Stream contract to spend streamOutDenom tokens
    const approveTx = await streamOutDenomContract.approve(stream.address, streamOutAmount);
    await approveTx.wait();
    console.log(`Approved ${streamOutAmount} tokens for Stream contract`);

    // Call createStream function
    const streamContract = await hre.ethers.getContractAt("Stream", stream.address);

    const createStreamTx = await streamContract.createStream(
      streamOutAmount,
      streamOutDenom.address, // streamOutDenom
      bootstrappingStartTime,
      streamStartTime,
      streamEndTime,
      1000, // Example threshold
      "Test Stream",
      inDenom.address // inDenom
    );
    await createStreamTx.wait();
    console.log(`Stream is created`);

    // Query stream data
    const StreamFlag = await streamContract.streamCreated();
    console.log(`Stream flag is ${StreamFlag}`);

    const tokenBalance = await streamOutDenomContract.balanceOf(stream.address);
    console.log(`Token balance of the stream contract is ${tokenBalance}`);

    const streamStatus = await streamContract.streamStatus();
    console.log(`Stream status is ${streamStatus}`);

    // Call synchronizeStream
    console.log("Synchronizing stream...");
    let synchronizeStreamTx = await streamContract.syncStreamExternal();
    await synchronizeStreamTx.wait();
    console.log("Stream synchronized");
    // get logs
    const filter1 = streamContract.filters.StreamSynced();
    const logs1 = await streamContract.queryFilter(filter1);
    if (logs1.length > 0) {
      const [mainStatus, finalizedStatus, lastSyncTimestamp] = logs1[logs1.length - 1].args;
      console.log("Stream Sync Details:");
      console.log(`- Main Status: ${mainStatus}`);
      console.log(`- Finalized Status: ${finalizedStatus}`);
      console.log(`- Last Sync Timestamp: ${lastSyncTimestamp}`);
      console.log(`- Last Sync Date: ${new Date(Number(lastSyncTimestamp) * 1000)}`);
    }

    // For the second sync, explicitly set the time to streamStartTime
    await mineBlock(streamStartTime);

    synchronizeStreamTx = await streamContract.syncStreamExternal();
    // Mine the transaction block
    await mineBlock(streamStartTime + 12); // Assuming BLOCK_TIME is 12 seconds
    await synchronizeStreamTx.wait();
    console.log("Stream synchronized");

    // get logs
    const filter2 = streamContract.filters.StreamSynced();
    const logs2 = await streamContract.queryFilter(filter2);
    if (logs2.length > 0) {
      const [mainStatus, finalizedStatus, lastSyncTimestamp] = logs2[logs2.length - 1].args;
      // assert that the main status is 1
      console.log("Stream Sync Details:");
      console.log(`- Main Status: ${mainStatus}`);
      console.log(`- Finalized Status: ${finalizedStatus}`);
      console.log(`- Last Sync Timestamp: ${lastSyncTimestamp}`);
      console.log(`- Last Sync Date: ${new Date(Number(lastSyncTimestamp) * 1000)}`);
    }

    // Only disable automine after all contracts are deployed
    await hre.ethers.provider.send("evm_setAutomine", [false]);
  } catch (error: unknown) {
    await hre.ethers.provider.send("evm_setAutomine", [true]);
    console.error("Deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export default deployStreamContract;
