import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { assert } from "chai";

/**
 * Deploys the StreamFactory contract and uses it to create a Stream.
 */
const deployStreamContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    // Reset the local network first
    await hre.network.provider.send("hardhat_reset");

    // Keep automine enabled for deployments
    const { deployer, subscriber1 } = await hre.getNamedAccounts();
    const { deploy } = hre.deployments;

    // Get the signer for subscriber1
    const subscriber1Signer = await hre.ethers.getSigner(subscriber1);

    // Set initial block time
    const nowSeconds = (await hre.ethers.provider.getBlock("latest"))?.timestamp ?? 0;
    console.log(`Starting time: ${nowSeconds}`);

    let waitSeconds = 50;
    let bootstrappingDuration = 50;
    let streamDuration = 100;

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

    // Deploy StreamFactory contract
    const streamFactory = await deploy("StreamFactory", {
      from: deployer,
      args: [100, "0x0000000000000000000000000000000000000000", 5, 1, 1, 1, [inDenom.address], deployer, deployer, "1.0.0"],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("StreamFactory contract deployed at:", streamFactory.address);

    // Set up allowance for the StreamFactory to spend streamOutDenom tokens
    const approveTx = await streamOutDenomContract.approve(streamFactory.address, streamOutAmount);
    await approveTx.wait();
    console.log(`Approved ${streamOutAmount} tokens for StreamFactory contract`);

    // Use StreamFactory to create a new Stream
    const streamFactoryContract = await hre.ethers.getContractAt("StreamFactory", streamFactory.address);
    // Log parameters
    console.log(`streamOutAmount: ${streamOutAmount}`);
    console.log(`streamOutDenom: ${streamOutDenom.address}`);
    console.log(`bootstrappingStartTime: ${bootstrappingStartTime}`);
    console.log(`streamStartTime: ${streamStartTime}`);
    console.log(`streamEndTime: ${streamEndTime}`);
    console.log(`inDenom: ${inDenom.address}`);

    const createStreamTx = await streamFactoryContract.createStream(
      streamOutAmount,
      streamOutDenom.address, // streamOutDenom
      bootstrappingStartTime,
      streamStartTime,
      streamEndTime,
      1000, // Example threshold
      "Test Stream",
      inDenom.address,
      "1.0.0",
      { value: 100 }
    );
    await createStreamTx.wait();
    // // get event StreamCreated
    // const filter = streamFactoryContract.filters.StreamCreated();
    // const logs = await streamFactoryContract.queryFilter(filter);
    // const streamAddress = logs[logs.length - 1].args[5];
    // console.log(`Stream is created at ${streamAddress}`);
    const streamAddress = "asd"

    // Query stream data
    const streamContract = await hre.ethers.getContractAt("Stream", streamAddress as string);

    const tokenBalance = await streamOutDenomContract.balanceOf(streamAddress as string);
    console.log(`Token balance of the stream contract is ${tokenBalance}`);

    const streamStatus = await streamContract.streamStatus();
    console.log(`Stream status is ${streamStatus}`);

    // Call synchronizeStream
    console.log("Synchronizing stream...");
    let synchronizeStreamTx = await streamContract.syncStreamExternal()
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
    await mineBlock(streamStartTime - 1);

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

    // Subscribe to the stream
    // First give subscribeAmount approval to the stream contract
    const subscribeAmount = 1000;
    const inDenomContract = await hre.ethers.getContractAt("ERC20Mock", inDenom.address);
    // First mint tokens for the subscriber
    const mintTx = await inDenomContract.mint(subscriber1, subscribeAmount);
    await mintTx.wait();
    console.log(`Minted ${subscribeAmount} tokens for subscriber`);

    // Then give subscribeAmount approval to the stream contract
    const approveTx2 = await inDenomContract.approve(streamAddress as string, subscribeAmount);
    await approveTx2.wait();
    console.log(`Approved ${subscribeAmount} tokens for Stream contract`);

    // Subscribe to the stream
    // set time to half way through the stream
    await mineBlock(streamStartTime - 1 + (streamDuration / 2));
    const subscribeTx = await streamContract.connect(subscriber1Signer).subscribe(subscribeAmount);
    await subscribeTx.wait();
    console.log("Subscribed to the stream");

    // Synchronize the stream at just before the stream end time
    await mineBlock(streamEndTime - 2);
    const synchronizeStreamTx2 = await streamContract.syncStreamExternal();
    await mineBlock(streamEndTime);
    await synchronizeStreamTx2.wait();
    console.log("Stream synchronized");

    // Get the logs
    const filter3 = streamContract.filters.StreamSynced();
    const logs3 = await streamContract.queryFilter(filter3);
    if (logs3.length > 0) {
      const [mainStatus, finalizedStatus, lastSyncTimestamp] = logs3[logs3.length - 1].args;
      console.log("Stream Sync Details:");
      console.log(`- Main Status: ${mainStatus}`);
      console.log(`- Finalized Status: ${finalizedStatus}`);
      console.log(`- Last Sync Timestamp: ${lastSyncTimestamp}`);
    }

    // Get stream state
    const streamState = await streamContract.streamState();
    // Parse streamState to get the stream details
    const spentIn = streamState.spentIn;
    console.log(`Spent in: ${spentIn}`);
    const shares = streamState.shares;
    console.log(`Shares: ${shares}`);
    const distributionIndex = streamState.distIndex;
    console.log(`Distribution index: ${distributionIndex}`);

    // Finalize the stream
    const finalizeStreamTx = await streamContract.finalizeStream();
    await finalizeStreamTx.wait();
    console.log("Stream finalized");

    // Exit the stream for subscriber1
    const exitTx = await streamContract.connect(subscriber1Signer).exitStream();
    await exitTx.wait();
    console.log("Exited the stream");

    // Only disable automine after all contracts are deployed
    await hre.ethers.provider.send("evm_setAutomine", [false]);
  } catch (error: unknown) {
    await hre.ethers.provider.send("evm_setAutomine", [true]);
    console.error("Deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export default deployStreamContract;
