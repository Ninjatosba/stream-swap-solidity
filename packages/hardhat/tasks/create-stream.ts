/**
 * @title Create Stream Task
 * @notice Hardhat task to create a new stream using the deployed StreamFactory
 * @dev This task demonstrates the complete stream creation process including token approvals,
 *      parameter validation, and event parsing
 * 
 * Usage:
 *   npx hardhat create-stream --network <network>
 * 
 * Prerequisites:
 *   1. StreamFactory must be deployed on the target network
 *   2. InToken and OutToken must be deployed
 *   3. Creator account must have sufficient OutToken balance
 *   4. Creator account must have ETH for gas fees
 * 
 * What it does:
 *   1. Loads deployed contract addresses from hardhat-deploy
 *   2. Gets deployer and creator accounts from signers
 *   3. Checks creator's output token balance
 *   4. Approves StreamFactory to spend output tokens
 *   5. Sets up stream timing (20s bootstrap, 30s stream duration)
 *   6. Creates stream with default configuration
 *   7. Parses StreamCreated event to get new stream address
 * 
 * Configuration:
 *   - Uses defaultStreamConfig from deploy/config/stream-config.ts
 *   - Stream timing: bootstrap starts +20s, stream +50s to +100s
 *   - Default threshold and vesting settings applied
 * 
 * Output:
 *   - Logs creator account and balances
 *   - Shows transaction hash and block number
 *   - Displays new stream address and ID
 */

import { task } from "hardhat/config";
import { defaultStreamConfig } from "../deploy/config/stream-config";
import { Log } from "ethers";
import { StreamFactory, ERC20Mock } from "../typechain-types";

task("create-stream", "Creates a new stream using the deployed factory").setAction(async (_, hre) => {
  const { deployments, ethers } = hre;

  // Get deployment addresses
  const streamFactoryDeployment = await deployments.get("StreamFactory");
  const inTokenDeployment = await deployments.get("InToken");
  const outTokenDeployment = await deployments.get("OutToken");

  const streamFactoryAddress = streamFactoryDeployment.address;
  const inTokenAddress = inTokenDeployment.address;
  const outTokenAddress = outTokenDeployment.address;

  // Get accounts
  const [deployer, creator] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Creator: ${creator.address}`);

  // Get contract instances with proper types
  const StreamFactoryContract = await ethers.getContractFactory("StreamFactory");
  const streamFactory = StreamFactoryContract.attach(streamFactoryAddress) as unknown as StreamFactory;
  const ERC20MockContract = await ethers.getContractFactory("ERC20Mock");
  const outToken = ERC20MockContract.attach(outTokenAddress) as unknown as ERC20Mock;

  // Check creator's output token balance
  const creatorOutTokenBalance = await outToken.balanceOf(creator.address);
  console.log(`Creator's output token balance: ${creatorOutTokenBalance}`);
  if (creatorOutTokenBalance < BigInt(defaultStreamConfig.streamOutAmount)) {
    throw new Error("Insufficient output token balance");
  }

  // Approve tokens if needed
  const allowance = await outToken.allowance(creator.address, streamFactoryAddress);
  if (allowance < BigInt(defaultStreamConfig.streamOutAmount) + ethers.parseEther("1000")) {
    const approveTx = await outToken
      .connect(creator)
      .approve(streamFactoryAddress, BigInt(defaultStreamConfig.streamOutAmount) + ethers.parseEther("1000"));
    await approveTx.wait();
    console.log("Approved out token for StreamFactory");
  }

  // Get factory params
  const factoryParams = await streamFactory.getParams();
  const streamCreationFee = factoryParams.streamCreationFee;
  const streamCreationFeeToken = factoryParams.streamCreationFeeToken;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  let txOptions = {};
  if (streamCreationFeeToken === zeroAddress) {
    txOptions = streamCreationFee ? { value: streamCreationFee } : {};
  }

  // Get current block timestamp
  const latestBlock = await ethers.provider.getBlock("latest");
  const nowSeconds = latestBlock?.timestamp ?? 0;
  const bootstrappingStartTime = nowSeconds + 60;
  const streamStartTime = nowSeconds + 120;
  const streamEndTime = nowSeconds + 130;

  // Prepare stream creation message
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const createStreamMessage = {
    streamOutAmount: defaultStreamConfig.streamOutAmount,
    outSupplyToken: outTokenAddress,
    bootstrappingStartTime,
    streamStartTime,
    streamEndTime,
    threshold: defaultStreamConfig.threshold,
    metadata: { ipfsHash: "QmcA6XHQ6ERUfaXkJuS9qxHG12nYCDx7QrRXZKKmNr6GJQ" },
    inSupplyToken: inTokenAddress,
    tosVersion: defaultStreamConfig.tosVersion,
    creator: creator.address,
    creatorVesting: defaultStreamConfig.creatorVestingInfo,
    beneficiaryVesting: defaultStreamConfig.beneficiaryVestingInfo,
    poolInfo: { poolOutSupplyAmount: ethers.parseEther("500") },
    salt,
  };

  // Print all parameters for debugging
  console.log("\n--- createStream parameters ---");
  console.dir(createStreamMessage, { depth: null });
  console.log("txOptions:", txOptions);
  console.log("------------------------------\n");

  // Create stream
  const tx = await streamFactory.connect(creator).createStream(createStreamMessage, txOptions);
  console.log(`Stream creation tx: ${tx.hash}`);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Transaction receipt is null");
  }

  console.log(`Stream created in block: ${receipt.blockNumber}`);

  // Parse event
  const event = receipt.logs
    .map((log: Log) => {
      try {
        return streamFactory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log: any) => log && log.name === "StreamCreated");

  if (event) {
    // Access event arguments by their correct names from the event definition
    const streamAddress = event.args.streamAddress;
    const streamId = event.args.streamId;
    console.log(`New Stream Address: ${streamAddress} (ID: ${streamId})`);
  } else {
    console.error("StreamCreated event not found in logs");
  }
});
