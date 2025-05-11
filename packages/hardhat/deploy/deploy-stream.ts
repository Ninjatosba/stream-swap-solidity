import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction, Receipt } from "hardhat-deploy/types";
import { Addressable, AddressLike, BigNumberish, ethers, parseEther } from "ethers";
import { defaultStreamConfig, calculateTimestamps, StreamConfig } from "./config/stream-config";
import { StreamFactoryTypes, StreamTypes } from "../typechain-types/contracts/StreamFactory";

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

    //console.log(`Deploying stream with ${JSON.stringify(streamConfig, null, 2)} configuration`);

    // Get deployer account
    const { deployer, creator } = await hre.getNamedAccounts();
    console.log(`Deployer address: ${deployer}`);
    console.log(`Creator address: ${creator}`);

    const deployerBalance = await hre.ethers.provider.getBalance(deployer);
    const creatorBalance = await hre.ethers.provider.getBalance(creator);
    console.log(`Deployer balance: ${deployerBalance}`);
    console.log(`Creator balance: ${creatorBalance}`);
    if (creatorBalance < BigInt(60000000000)) {
      console.log(`Creator has insufficient balance. Sending 0.000006 ethers to creator`);
      const deployerSigner = await hre.ethers.getSigner(deployer);
      const sendEtherTx = await deployerSigner.sendTransaction({
        to: creator,
        value: parseEther("0.000006")
      });
      await sendEtherTx.wait();
      console.log(`Transaction sent: ${sendEtherTx.hash}`);
    }

    // Get signers
    const creatorSigner = await hre.ethers.getSigner(creator);

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
    let inTokenAddress, outTokenAddress;
    try {
      const inTokenDeployment = await get("InToken");
      inTokenAddress = inTokenDeployment.address;
      console.log(`Found in token at: ${inTokenAddress}`);
    } catch (error) {
      console.error("in token not found. Please deploy it first.");
      throw new Error("in token not deployed");
    }

    try {
      const outTokenDeployment = await get("OutToken");
      outTokenAddress = outTokenDeployment.address;
      console.log(`Found out token at: ${outTokenAddress}`);
    } catch (error) {
      console.error("out token not found. Please deploy it first.");
      throw new Error("out token not deployed");
    }

    // Get contract instances
    const streamFactoryContract = await hre.ethers.getContractAt("StreamFactory", streamFactoryAddress);
    const outTokenContract = await hre.ethers.getContractAt("ERC20Mock", outTokenAddress);

    console.log("Step 1: Checking creator's output token balance...");
    const creatorOutTokenBalance = await outTokenContract.balanceOf(creator);
    console.log(`Creator's output token balance: ${creatorOutTokenBalance}`);

    if (BigInt(creatorOutTokenBalance) < BigInt(streamConfig.streamOutAmount)) {
      console.error(`Insufficient output token balance. Required: ${streamConfig.streamOutAmount}, Available: ${creatorOutTokenBalance}`);
      throw new Error("Insufficient output token balance");
    }

    console.log("Step 2: Checking token allowance...");
    const outTokenAllowance = await outTokenContract.connect(creatorSigner).allowance(creator, streamFactoryAddress);
    console.log(`Current out token allowance: ${outTokenAllowance}`);

    if (BigInt(outTokenAllowance) < BigInt(streamConfig.streamOutAmount)) {
      console.log("Step 3: Setting token approval...");
      console.log(`Setting approval for StreamFactory to spend ${streamConfig.streamOutAmount} out tokens`);
      console.log(`Sending approval transaction...`);
      const approveOutTokenTx = await outTokenContract.connect(creatorSigner).approve(streamFactoryAddress, streamConfig.streamOutAmount);
      console.log(`Approval transaction sent: ${approveOutTokenTx.hash}`);
      console.log(`Waiting for approval confirmation...`);
      const receipt = await approveOutTokenTx.wait();
      console.log(`Approval confirmed in block ${receipt?.blockNumber}`);
      console.log(`Out token approval transaction confirmed: ${approveOutTokenTx.hash}`);
    }

    console.log("Step 4: Getting factory fee information...");
    const factoryParams: StreamFactoryTypes.ParamsStruct = await streamFactoryContract.getParams();
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

      // Check if creator has enough native balance
      const creatorNativeBalance = await hre.ethers.provider.getBalance(creator);
      console.log(`Creator native balance: ${creatorNativeBalance}`);

      if (BigInt(creatorNativeBalance) < BigInt(streamCreationFee)) {
        console.error(`Insufficient native token balance. Required: ${streamCreationFee}, Available: ${creatorNativeBalance}`);
        throw new Error("Insufficient native token balance for fee");
      }

      txOptions = streamCreationFee ? { value: streamCreationFee } : {};
    } else {
      // ERC-20 token fee
      console.log(`Factory requires ${streamCreationFee} tokens at ${streamCreationFeeToken} as fee`);

      // Get fee token contract
      const feeTokenContract = await hre.ethers.getContractAt("ERC20Mock", streamCreationFeeToken as Addressable);

      // Check fee token balance
      const creatorFeeTokenBalance = await feeTokenContract.balanceOf(creator);
      console.log(`Creator fee token balance: ${creatorFeeTokenBalance}`);

      if (BigInt(creatorFeeTokenBalance) < BigInt(streamCreationFee)) {
        console.error(`Insufficient fee token balance. Required: ${streamCreationFee}, Available: ${creatorFeeTokenBalance}`);
        throw new Error("Insufficient fee token balance");
      }

      // Check and set allowance for fee token
      const feeAllowance = await feeTokenContract.connect(creatorSigner).allowance(creator, streamFactoryAddress);
      console.log(`Current fee token allowance: ${feeAllowance}`);

      if (BigInt(feeAllowance) < BigInt(streamCreationFee)) {
        console.log(`Setting approval for StreamFactory to spend ${streamCreationFee} fee tokens`);
        const approveFeeTokenTx = await feeTokenContract.connect(creatorSigner).approve(streamFactoryAddress, streamCreationFee);
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
    console.log("Stream creation parameters:");
    console.log(`- Stream out amount: ${streamConfig.streamOutAmount}`);
    console.log(`- Stream out token: ${outTokenAddress}`);
    console.log(`- Bootstrapping start time: ${bootstrappingStartTime}`);
    console.log(`- Stream start time: ${streamStartTime}`);
    console.log(`- Stream end time: ${streamEndTime}`);
    console.log(`- Threshold: ${streamConfig.threshold}`);
    console.log(`- Stream name: ${streamConfig.streamName}`);
    console.log(`- In token: ${inTokenAddress}`);
    console.log(`- TOS version: ${streamConfig.tosVersion}`);

    // Generate a random salt for the stream creation
    const salt = ethers.hexlify(ethers.randomBytes(32));
    console.log(`Using salt: ${salt}`);

    console.log("Step 5: Preparing stream creation message...");
    const createStreamMessage: StreamTypes.CreateStreamMessageStruct = {
      streamOutAmount: streamConfig.streamOutAmount,
      outSupplyToken: outTokenAddress,
      bootstrappingStartTime: bootstrappingStartTime,
      streamStartTime: streamStartTime,
      streamEndTime: streamEndTime,
      threshold: streamConfig.threshold,
      name: streamConfig.streamName,
      inSupplyToken: inTokenAddress,
      tosVersion: streamConfig.tosVersion,
      creator: creator,
      creatorVesting: streamConfig.creatorVestingInfo,
      beneficiaryVesting: streamConfig.beneficiaryVestingInfo,
      poolInfo: {
        poolOutSupplyAmount: 0
      },
      salt: salt,
    }

    console.log("Step 6: Creating stream...");
    console.log("Sending createStream transaction...");
    const createStreamTx = await streamFactoryContract.connect(creatorSigner).createStream(
      createStreamMessage,
      txOptions
    );
    console.log(`Stream creation transaction sent: ${createStreamTx.hash}`);
    console.log("Waiting for stream creation confirmation...");
    const receipt = await createStreamTx.wait();
    console.log(`Stream creation confirmed in block ${receipt?.blockNumber}`);

    console.log("Step 7: Processing stream creation event...");
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
