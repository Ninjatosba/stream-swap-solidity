import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { assert } from "chai";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

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
      ethers.getBytes("0x0000000000000000000000000000000000000000000000000000000000000000"),
      { value: 100 }
    );

    // Wait for transaction confirmation
    await createStreamTx.wait();
    const txReceipt = await hre.ethers.provider.getTransactionReceipt(createStreamTx.hash);

    let streamAddress = "";

    const streamFactoryInterface = new ethers.Interface([
      "event StreamCreated(uint256 indexed streamOutAmount, uint256 indexed bootstrappingStartTime, uint256 streamStartTime, uint256 streamEndTime, address indexed streamAddress)"
    ]);


    // Find and parse the event
    const parsedLog = txReceipt?.logs
      .map((log: any) => {
        try {
          return streamFactoryInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log: any) => log !== null);

    if (parsedLog) {
      streamAddress = ethers.getAddress(parsedLog.args[4]); // Normalize address
      console.log("New Stream Contract Address:", streamAddress);

    } else {
      console.error("StreamCreated event not found in transaction logs.");
    }

    if (!ethers.isAddress(streamAddress)) {
      console.error("Invalid contract address:", streamAddress);
    }

    // Query token contract for stream contract balance
    const streamContractBalance = await streamOutDenomContract.balanceOf(streamAddress);
    console.log(`Stream contract balance is ${streamContractBalance}`);


    let streamContract = await hre.ethers.getContractAt("Stream", streamAddress);
    const streamStatus = await streamContract.streamStatus();
    console.log(`Stream status is ${streamStatus.mainStatus}`);

  } catch (error: unknown) {
    console.error("Deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export default deployStreamContract;
