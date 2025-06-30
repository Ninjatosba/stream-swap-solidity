import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  createFactoryConfig,
  createProductionFactoryConfig,
  createTestnetFactoryConfig,
  FactoryConfig,
} from "./config/factory-config";
import { getUniswapV2Addresses } from "./config/uniswap-config";
import { StreamFactoryTypes } from "../typechain-types/src/StreamFactory";
import { StreamFactory } from "../typechain-types/src/StreamFactory";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  // Get config from environment or use default
  let config: FactoryConfig;

  // Get environment from args
  const environment =
    process.argv.indexOf("--network") !== -1 ? process.argv[process.argv.indexOf("--network") + 1] : "default";

  // block height
  const blockHeight = await hre.ethers.provider.getBlockNumber();
  console.log(`Block height: ${blockHeight}`);

  // get in token address
  let inTokenAddress: string;
  try {
    const inTokenDeployment = await get("InToken");
    inTokenAddress = inTokenDeployment.address;
    console.log(`Found in token at: ${inTokenAddress}`);
  } catch {
    console.error("in token not found. Please deploy it first.");
    throw new Error("in token not deployed");
  }

  // get stream creation fee
  let streamCreationFeeToken: string;
  try {
    const streamCreationFeeTokenDeployment = await get("StreamCreationFeeToken");
    streamCreationFeeToken = streamCreationFeeTokenDeployment.address;
    console.log(`Found stream creation fee token at: ${streamCreationFeeToken}`);
  } catch (error) {
    void error; // Explicitly ignore the error parameter
    console.error("stream creation fee token not found. Please deploy it first.");
    throw new Error("stream creation fee token not deployed");
  }

  switch (environment) {
    case "sepolia":
      config = createTestnetFactoryConfig(deployer, inTokenAddress, 0, streamCreationFeeToken);
      break;
    case "production":
      config = createProductionFactoryConfig(deployer, inTokenAddress, 0, streamCreationFeeToken);
      break;
    default:
      config = createFactoryConfig(deployer, [inTokenAddress], 0, streamCreationFeeToken);
  }

  // Get Uniswap V2 addresses for the network
  const uniswapAddresses = getUniswapV2Addresses(environment);
  console.log(`Using Uniswap V2 Factory: ${uniswapAddresses.factory}`);
  console.log(`Using Uniswap V2 Router: ${uniswapAddresses.router}`);

  // Deploy pool wrapper with Uniswap V2 addresses
  const poolWrapper = await deploy("PoolWrapper", {
    from: deployer,
    args: [uniswapAddresses.factory, uniswapAddresses.router],
    log: true,
    skipIfAlreadyDeployed: false,
    deterministicDeployment: false,
  });
  const poolWrapperAddress = poolWrapper.address;
  console.log(`PoolWrapper contract deployed at: ${poolWrapperAddress}`);
  console.log(`Deployer: ${deployer}`);

  console.log("deployer balance ", await hre.ethers.provider.getBalance(deployer));

  try {
    // Deploy StreamFactory with just the protocol admin
    const streamFactory = await deploy("StreamFactory", {
      from: deployer,
      args: [deployer],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log(`StreamFactory contract deployed at: ${streamFactory.address}`);

    // Deploy Stream implementation (mother contract)
    const streamImplementation = await deploy("Stream", {
      from: deployer,
      args: [streamFactory.address],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log(`Stream implementation (mother contract) deployed at: ${streamImplementation.address}`);

    // Get contract instance for initialization
    const StreamFactoryContract = await hre.ethers.getContractFactory("StreamFactory");

    // Prepare initialization message
    const initMessage: StreamFactoryTypes.InitializeStreamMessageStruct = {
      streamCreationFee: config.streamCreationFee,
      streamCreationFeeToken: config.streamCreationFeeToken,
      exitFeeRatio: config.ExitFeeRatio,
      minWaitingDuration: config.minWaitingDuration,
      minBootstrappingDuration: config.minBootstrappingDuration,
      minStreamDuration: config.minStreamDuration,
      feeCollector: config.feeCollector,
      protocolAdmin: config.protocolAdmin,
      tosVersion: config.tosVersion,
      acceptedInSupplyTokens: config.acceptedInTokens,
      poolWrapperAddress: poolWrapperAddress,
      streamImplementationAddress: streamImplementation.address,
    };

    // Initialize the factory
    const factory = (await StreamFactoryContract.attach(streamFactory.address)) as StreamFactory;
    const isInitialized = await factory.initialized();
    if (!isInitialized) {
      const tx = await factory.initialize(initMessage);
      await tx.wait();
      console.log(`StreamFactory initialized with ${environment} configuration`);
      console.log(`Factory params: ${JSON.stringify(initMessage)}`);
    } else {
      console.log(`StreamFactory already initialized`);
    }
  } catch (error: unknown) {
    console.error("Deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export default func;
func.tags = ["stream-factory"];
func.dependencies = ["tokens"];
