import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction, Receipt } from "hardhat-deploy/types";
import { Addressable, AddressLike, BigNumberish, ethers } from "ethers";
import { defaultStreamConfig, calculateTimestamps, StreamConfig } from "./config/stream-config";
import { StreamFactory } from "../typechain-types";

/**
 * Deploys a Stream using an existing StreamFactory.
 * Assumes tokens and factory are already deployed.
 */
const deployStreamContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    // Get environment from argv
    const environment = process.argv.indexOf("--network") !== -1
      ? process.argv[process.argv.indexOf("--network") + 1]
      : "default";

    // Load appropriate stream config
    let streamConfig: StreamConfig;
    switch (environment) {
      case "testnet": {
        const { testnetStreamConfig } = await import("./config/stream-config");
        streamConfig = testnetStreamConfig;
        break;
      }
      case "production": {
        const { productionStreamConfig } = await import("./config/stream-config");
        streamConfig = productionStreamConfig;
        break;
      }
      default: {
        streamConfig = defaultStreamConfig;
      }
    }

    console.log(`Deploying stream with ${JSON.stringify(streamConfig, null, 2)} configuration`);

    // Get deployer account
    const { deployer } = await hre.getNamedAccounts();
    console.log(`Deployer address: ${deployer}`);

    // Get existing contracts
    const { get } = hre.deployments;

    // Check if factory exists
    let streamFactoryAddress;
    try {
      const streamFactoryDeployment = await get("StreamFactory");
      streamFactoryAddress = streamFactoryDeployment.address;
      console.log(`Found StreamFactory at: ${streamFactoryAddress}`);
    } catch (error) {
      console.error("StreamFactory not found. Please deploy it first.");
      throw new Error("StreamFactory not deployed");
    }

    // Check if tokens exist
    let inDenomAddress, outDenomAddress;
    try {
      const inDenomDeployment = await get("InDenomToken");
      inDenomAddress = inDenomDeployment.address;
      console.log(`Found inDenom token at: ${inDenomAddress}`);
    } catch (error) {
      console.error("inDenom token not found. Please deploy it first.");
      throw new Error("inDenom token not deployed");
    }

    try {
      const outDenomDeployment = await get("OutDenomToken");
      outDenomAddress = outDenomDeployment.address;
      console.log(`Found outDenom token at: ${outDenomAddress}`);
    } catch (error) {
      console.error("outDenom token not found. Please deploy it first.");
      throw new Error("outDenom token not deployed");
    }

    // Get contract instances
    const streamFactoryContract = await hre.ethers.getContractAt("StreamFactory", streamFactoryAddress);
    const outDenomContract = await hre.ethers.getContractAt("ERC20Mock", outDenomAddress);

    // Check token balance and allowance for stream out tokens
    const deployerBalance = await outDenomContract.balanceOf(deployer);
    console.log(`Deployer balance of stream out tokens: ${deployerBalance}`);

    if (BigInt(deployerBalance) < BigInt(streamConfig.streamOutAmount)) {
      console.error(`Insufficient token balance. Required: ${streamConfig.streamOutAmount}, Available: ${deployerBalance}`);
      throw new Error("Insufficient token balance");
    }

    const allowance = await outDenomContract.allowance(deployer, streamFactoryAddress);
    console.log(`Current allowance for factory: ${allowance} tokens`);

    if (BigInt(allowance) < BigInt(streamConfig.streamOutAmount)) {
      console.log(`Setting approval for StreamFactory to spend ${streamConfig.streamOutAmount} tokens`);
      const approveTx = await outDenomContract.approve(streamFactoryAddress, streamConfig.streamOutAmount);
      await approveTx.wait();
      console.log(`Approval transaction confirmed: ${approveTx.hash}`);
    }

    // Get factory fee information
    const factoryParams: StreamFactory.ParamsStruct = await streamFactoryContract.getParams();
    const streamCreationFee: BigNumberish = factoryParams.streamCreationFee;
    const streamCreationFeeToken: AddressLike = factoryParams.streamCreationFeeToken;
    console.log(`Factory fee: ${streamCreationFee} ${streamCreationFeeToken}`);
    console.log(`Fee token address: ${streamCreationFeeToken}`);

    // Handle fee payment based on fee token
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    let txOptions = {};

    if (streamCreationFeeToken === zeroAddress) {
      // Native token fee
      console.log(`Factory requires ${streamCreationFee} native tokens as fee`);

      // Check if deployer has enough native balance
      const deployerNativeBalance = await hre.ethers.provider.getBalance(deployer);
      console.log(`Deployer native balance: ${deployerNativeBalance}`);

      if (BigInt(deployerNativeBalance) < BigInt(streamCreationFee)) {
        console.error(`Insufficient native token balance. Required: ${streamCreationFee}, Available: ${deployerNativeBalance}`);
        throw new Error("Insufficient native token balance for fee");
      }

      txOptions = { value: streamCreationFee };
    } else {
      // ERC-20 token fee
      console.log(`Factory requires ${streamCreationFee} tokens at ${streamCreationFeeToken} as fee`);

      // Get fee token contract
      const feeTokenContract = await hre.ethers.getContractAt("ERC20Mock", streamCreationFeeToken as Addressable);

      // Check fee token balance
      const deployerFeeTokenBalance = await feeTokenContract.balanceOf(deployer);
      console.log(`Deployer fee token balance: ${deployerFeeTokenBalance}`);

      if (BigInt(deployerFeeTokenBalance) < BigInt(streamCreationFee)) {
        console.error(`Insufficient fee token balance. Required: ${streamCreationFee}, Available: ${deployerFeeTokenBalance}`);
        throw new Error("Insufficient fee token balance");
      }

      // Check and set allowance for fee token
      const feeAllowance = await feeTokenContract.allowance(deployer, streamFactoryAddress);
      console.log(`Current fee token allowance: ${feeAllowance}`);

      if (BigInt(feeAllowance) < BigInt(streamCreationFee)) {
        console.log(`Setting approval for StreamFactory to spend ${streamCreationFee} fee tokens`);
        const approveFeeTokenTx = await feeTokenContract.approve(streamFactoryAddress, streamCreationFee);
        await approveFeeTokenTx.wait();
        console.log(`Fee token approval transaction confirmed: ${approveFeeTokenTx.hash}`);
      }

      // No need to set value for ERC-20 fees
      txOptions = {};
    }

    // Set initial block time
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const nowSeconds = latestBlock?.timestamp ?? 0;
    console.log(`Current block timestamp: ${nowSeconds}`);

    // Calculate timestamps
    const { bootstrappingStartTime, streamStartTime, streamEndTime } = calculateTimestamps(streamConfig, nowSeconds);

    console.log("Stream time parameters:");
    console.log(`- Bootstrapping start: ${bootstrappingStartTime} (in ${bootstrappingStartTime - nowSeconds} seconds)`);
    console.log(`- Stream start: ${streamStartTime} (in ${streamStartTime - nowSeconds} seconds)`);
    console.log(`- Stream end: ${streamEndTime} (in ${streamEndTime - nowSeconds} seconds)`);

    // Create stream using factory
    console.log("Creating stream with parameters:");
    console.log(`- Stream out amount: ${streamConfig.streamOutAmount}`);
    console.log(`- Stream out denom: ${outDenomAddress}`);
    console.log(`- Bootstrapping start time: ${bootstrappingStartTime}`);
    console.log(`- Stream start time: ${streamStartTime}`);
    console.log(`- Stream end time: ${streamEndTime}`);
    console.log(`- Threshold: ${streamConfig.threshold}`);
    console.log(`- Stream name: ${streamConfig.streamName}`);
    console.log(`- In denom: ${inDenomAddress}`);
    console.log(`- TOS version: ${streamConfig.tosVersion}`);

    // Generate a random salt for the stream creation
    const salt = ethers.hexlify(ethers.randomBytes(32));
    console.log(`Using salt: ${salt}`);

    // Create stream with appropriate fee handling
    const createStreamTx = await streamFactoryContract.createStream(
      streamConfig.streamOutAmount,
      outDenomAddress,
      bootstrappingStartTime,
      streamStartTime,
      streamEndTime,
      streamConfig.threshold,
      streamConfig.streamName,
      inDenomAddress,
      streamConfig.tosVersion,
      salt,
      txOptions // This will include { value: factoryFee } for native token fees
    );

    console.log(`Stream creation transaction sent: ${createStreamTx.hash}`);

    // Wait for transaction confirmation
    const receipt = await createStreamTx.wait();
    console.log(`Stream creation confirmed in block ${receipt?.blockNumber}`);

    // Extract stream address from event logs
    const streamFactoryInterface = new ethers.Interface([
      "event StreamCreated(address indexed streamOutToken, address indexed streamInToken, address indexed streamFactoryAddress, uint256 streamOutAmount, uint256 bootstrappingStartTime, uint256 streamStartTime, uint256 streamEndTime, uint256 threshold, string streamName, string tosVersion, address streamAddress, uint16 streamId)"
    ]);

    // Find and parse the event
    const parsedLog = receipt?.logs
      .map((log: ethers.Log) => {
        try {
          return streamFactoryInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log: ethers.LogDescription | null) => log !== null);

    if (parsedLog) {
      const streamAddress = ethers.getAddress(parsedLog.args.streamAddress);
      console.log("New Stream Contract Address:", streamAddress);

      // Save the stream address for future reference
      await hre.deployments.save("Stream", {
        abi: [], // This would normally be the ABI
        address: streamAddress,
        receipt: receipt as unknown as Receipt,
        bytecode: "0x", // This would normally be the bytecode
        deployedBytecode: "0x", // This would normally be the deployed bytecode
      });

      // Verify stream status
      const streamContract = await hre.ethers.getContractAt("Stream", streamAddress);
      const streamStatus = await streamContract.streamStatus();
      console.log(`Stream status is ${streamStatus}`);

      return true;
    } else {
      console.error("StreamCreated event not found in transaction logs.");
      throw new Error("Stream creation failed");
    }

  } catch (error: unknown) {
    console.error("Deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

deployStreamContract.tags = ['stream'];
deployStreamContract.dependencies = ['tokens', 'stream-factory'];
deployStreamContract.id = 'deploy_stream';

export default deployStreamContract;
