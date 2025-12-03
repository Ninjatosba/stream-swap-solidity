import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { createFactoryConfig, createProductionFactoryConfig } from "../config/factory-config";
import {
  getV2Config,
  getV3Config,
  getAerodromeConfig,
  isPoolCreationEnabled,
  printChainSummary,
  getNetworkConfig,
} from "../config/scenarios";
import { StreamFactoryTypes } from "../../typechain-types/src/StreamFactory";
import { StreamFactory } from "../../typechain-types/src/StreamFactory";
import { ethers } from "hardhat";
import { getScenarioConfig } from "../config/scenarios";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_USDC_ADDRESS = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  // Get network name
  const network = hre.network.name;
  const chainConfig = getNetworkConfig(network);
  const scenario = getScenarioConfig(network);

  // Print chain & scenario summary
  printChainSummary(network);
  console.log(`Deployment Scenario: ${scenario.id} - ${scenario.title}`);
  console.log(`  Description: ${scenario.description}`);

  const blockHeight = await hre.ethers.provider.getBlockNumber();
  console.log(`Block height: ${blockHeight}`);
  console.log(`Deployer: ${deployer}`);
  console.log(`Deployer balance: ${await hre.ethers.provider.getBalance(deployer)}\n`);

  // Resolve accepted in-tokens and factory configuration based on scenario
  let acceptedInTokens: string[] = [];

  if (scenario.useProductionFactoryConfig) {
    // For production-style scenarios, rely on pre-configured tokens if present,
    // otherwise fall back to the previous behaviour (native + default USDC).
    acceptedInTokens =
      scenario.acceptedInTokens && scenario.acceptedInTokens.length > 0
        ? scenario.acceptedInTokens
        : [ZERO_ADDRESS, DEFAULT_USDC_ADDRESS];
  } else if (scenario.requireDevInToken) {
    // For dev/test scenarios we expect an "InToken" deployed by the tokens script.
    let inTokenAddress: string;
    try {
      const inTokenDeployment = await get("InToken");
      inTokenAddress = inTokenDeployment.address;
      console.log(`Found InToken at: ${inTokenAddress}`);
    } catch {
      console.error(
        "⚠️  InToken not found. Please deploy it first with: yarn deploy:tokens (or ensure the tokens script runs for this scenario).",
      );
      throw new Error("InToken not deployed");
    }

    acceptedInTokens = [inTokenAddress, ZERO_ADDRESS];
  } else {
    // Non-production scenario that does not require a dev InToken.
    // Allow the scenario to specify a custom set of tokens, otherwise
    // default to accepting only the native token.
    acceptedInTokens =
      scenario.acceptedInTokens && scenario.acceptedInTokens.length > 0
        ? scenario.acceptedInTokens
        : [ZERO_ADDRESS];
  }

  // Use configuration based on scenario / environment
  const config = scenario.useProductionFactoryConfig
    ? createProductionFactoryConfig(deployer, acceptedInTokens)
    : createFactoryConfig(deployer, acceptedInTokens);

  console.log(
    `\nUsing ${scenario.useProductionFactoryConfig ? "PRODUCTION" : "DEVELOPMENT"} configuration:`,
  );
  console.log(`  Min Waiting Duration: ${config.minWaitingDuration}s (${Math.round(config.minWaitingDuration / 3600 * 100) / 100}h)`);
  console.log(`  Min Bootstrapping Duration: ${config.minBootstrappingDuration}s (${Math.round(config.minBootstrappingDuration / 3600 * 100) / 100}h)`);
  console.log(`  Min Stream Duration: ${config.minStreamDuration}s (${Math.round(config.minStreamDuration / 86400 * 100) / 100}d)`);
  console.log(`  Exit Fee Ratio: ${Number(config.ExitFeeRatio.value) / 10000}%`);

  // Deploy PoolRouter and wrappers (if enabled)
  let poolRouterAddress = ZERO_ADDRESS;
  let v2PoolWrapperAddress = ZERO_ADDRESS;
  let v3PoolWrapperAddress = ZERO_ADDRESS;
  let aerodromePoolWrapperAddress = ZERO_ADDRESS;
  let basicImplAddress = ZERO_ADDRESS;
  let postImplAddress = ZERO_ADDRESS;
  if (isPoolCreationEnabled(network) || getAerodromeConfig(network)) {
    console.log("\n📦 Deploying PoolRouter...");
    const poolRouter = await deploy("PoolRouter", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    poolRouterAddress = poolRouter.address;
    console.log(`✅ PoolRouter deployed at: ${poolRouterAddress}`);

    // Deploy V2 Pool Wrapper (if enabled)
    const v2Config = getV2Config(network);
    if (chainConfig.poolWrappers.enableV2 && v2Config) {
      console.log(`\n📦 Deploying V2 Pool Wrapper (${v2Config.type})...`);
      console.log(`  Factory: ${v2Config.factory}`);
      console.log(`  Router: ${v2Config.router}`);

      const v2PoolWrapper = await deploy("V2PoolWrapper", {
        from: deployer,
        args: [v2Config.factory, v2Config.router],
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
      });
      v2PoolWrapperAddress = v2PoolWrapper.address;
      console.log(`✅ V2 Pool Wrapper deployed at: ${v2PoolWrapperAddress}`);
    } else {
      console.log("\n⏭️  V2 Pool Wrapper disabled - skipping deployment");
    }

    // Deploy V3 Pool Wrapper (if enabled)
    const v3Config = getV3Config(network);
    if (chainConfig.poolWrappers.enableV3 && v3Config) {
      console.log(`\n📦 Deploying V3 Pool Wrapper (${v3Config.type})...`);
      console.log(`  Factory: ${v3Config.factory}`);
      console.log(`  Position Manager: ${v3Config.positionManager}`);
      console.log(`  Default Fee Tier: ${v3Config.defaultFee / 10000}%`);

      const v3PoolWrapper = await deploy("V3PoolWrapper", {
        from: deployer,
        args: [v3Config.factory, v3Config.positionManager, v3Config.defaultFee],
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
      });
      v3PoolWrapperAddress = v3PoolWrapper.address;
      console.log(`✅ V3 Pool Wrapper deployed at: ${v3PoolWrapperAddress}`);
    } else {
      console.log("\n⏭️  V3 Pool Wrapper disabled - skipping deployment");
    }

    // Deploy Aerodrome Pool Wrapper (if configured)
    const aerodromeConfig = getAerodromeConfig(network);
    if (aerodromeConfig) {
      console.log(`\n📦 Deploying Aerodrome Pool Wrapper (${aerodromeConfig.type})...`);
      console.log(`  Factory: ${aerodromeConfig.factory}`);
      console.log(`  Router: ${aerodromeConfig.router}`);
      console.log(`  Pool Type: ${aerodromeConfig.stable ? "Stable" : "Volatile"}`);

      const aWrapper = await deploy("AerodromePoolWrapper", {
        from: deployer,
        args: [aerodromeConfig.factory, aerodromeConfig.router, aerodromeConfig.stable],
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
      });
      aerodromePoolWrapperAddress = aWrapper.address;
      console.log(`✅ Aerodrome Pool Wrapper deployed at: ${aerodromePoolWrapperAddress}`);
    } else {
      console.log("\n⏭️  Aerodrome Pool Wrapper disabled - skipping deployment");
    }

    // Configure PoolRouter wrappers
    const poolRouterContract = await hre.ethers.getContractAt("PoolRouter", poolRouterAddress);
    // DexType: 0=V2, 1=V3, 2=Aerodrome
    if (v2PoolWrapperAddress !== ZERO_ADDRESS) {
      const tx = await poolRouterContract
        .connect(await ethers.getSigner(deployer))
        .setWrapper(0, 0, v2PoolWrapperAddress);
      await tx.wait();
      console.log(`🔧 PoolRouter: set V2 wrapper key=0 -> ${v2PoolWrapperAddress}`);
    }
    if (v3PoolWrapperAddress !== ZERO_ADDRESS) {
      const v3 = getV3Config(network)!;
      const tx = await poolRouterContract
        .connect(await ethers.getSigner(deployer))
        .setWrapper(1, v3.defaultFee, v3PoolWrapperAddress);
      await tx.wait();
      console.log(`🔧 PoolRouter: set V3 wrapper key=${v3.defaultFee} -> ${v3PoolWrapperAddress}`);
    }
    if (aerodromePoolWrapperAddress !== ZERO_ADDRESS) {
      const aero = getAerodromeConfig(network)!;
      const key = aero.stable ? 1 : 0;
      const tx = await poolRouterContract
        .connect(await ethers.getSigner(deployer))
        .setWrapper(2, key, aerodromePoolWrapperAddress);
      await tx.wait();
      console.log(`🔧 PoolRouter: set Aerodrome wrapper key=${key} -> ${aerodromePoolWrapperAddress}`);
    }
  } else {
    console.log("\n⏭️  PoolRouter and pool wrappers disabled - skipping deployment");
  }

  try {
    // Deploy StreamFactory
    console.log("\n📦 Deploying StreamFactory...");
    const streamFactory = await deploy("StreamFactory", {
      from: deployer,
      args: [deployer],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log(`✅ StreamFactory deployed at: ${streamFactory.address}`);

    // Deploy implementation variants
    if (chainConfig.streamImplementations.enableBasic) {
      console.log("\n📦 Deploying StreamBasic implementation...");
      const basicImpl = await deploy("StreamBasic", {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
      });
      console.log(`✅ StreamBasic deployed at: ${basicImpl.address}`);
      basicImplAddress = basicImpl.address;
    }

    if (chainConfig.streamImplementations.enablePostActions) {
      console.log("\n📦 Deploying StreamPostActions implementation...");
      const postImpl = await deploy("StreamPostActions", {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
      });
      console.log(`✅ StreamPostActions deployed at: ${postImpl.address}`);
      postImplAddress = postImpl.address;
    }

    // Deploy TokenFactory
    console.log("\n📦 Deploying TokenFactory...");
    const tokenFactory = await deploy("TokenFactory", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log(`✅ TokenFactory deployed at: ${tokenFactory.address}`);

    // Deploy VestingFactory (if enabled)
    let vestingFactoryAddress = ZERO_ADDRESS;
    const enableVesting = chainConfig.enableVesting !== false; // Default to true if not specified
    if (enableVesting) {
      console.log("\n📦 Deploying VestingFactory...");
      const vestingFactory = await deploy("VestingFactory", {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
      });
      vestingFactoryAddress = vestingFactory.address;
      console.log(`✅ VestingFactory deployed at: ${vestingFactoryAddress}`);
    } else {
      console.log("\n⏭️  VestingFactory disabled - skipping deployment");
    }

    // Prepare initialization message
    console.log("\n🔧 Preparing initialization parameters...");
    const initMessage: StreamFactoryTypes.InitializeStreamFactoryMessageStruct = {
      streamCreationFee: config.streamCreationFee,
      streamCreationFeeToken: config.streamCreationFeeToken,
      exitFeeRatio: config.ExitFeeRatio,
      minWaitingDuration: config.minWaitingDuration,
      minBootstrappingDuration: config.minBootstrappingDuration,
      minStreamDuration: config.minStreamDuration,
      feeCollector: config.feeCollector,
      protocolAdmin: config.protocolAdmin,
      tosVersion: config.tosVersion,
      poolRouterAddress: poolRouterAddress,
      // Variant implementations
      basicImplementationAddress: basicImplAddress,
      postActionsImplementationAddress: postImplAddress,
      acceptedInSupplyTokens: config.acceptedInTokens,
      tokenFactoryAddress: tokenFactory.address,
      vestingFactoryAddress: vestingFactoryAddress,
    };

    console.log("\nInitialization Parameters:");
    console.log(
      `  Pool Router: ${poolRouterAddress === ZERO_ADDRESS ? "DISABLED" : poolRouterAddress}`,
    );
    console.log(`  Basic Impl: ${basicImplAddress}`);
    console.log(`  PostActions Impl: ${postImplAddress}`);
    console.log(`  Token Factory: ${tokenFactory.address}`);
    console.log(`  Vesting Factory: ${vestingFactoryAddress === ZERO_ADDRESS ? "DISABLED" : vestingFactoryAddress}`);
    console.log(`  Protocol Admin: ${config.protocolAdmin}`);
    console.log(`  Fee Collector: ${config.feeCollector}`);
    console.log(`  TOS Version: ${config.tosVersion}`);

    // Initialize the factory
    console.log("\n🚀 Initializing StreamFactory...");
    const StreamFactoryContract = await hre.ethers.getContractFactory("StreamFactory");
    const factory = (await StreamFactoryContract.attach(streamFactory.address)) as StreamFactory;

    const isInitialized = await factory.initialized();
    if (!isInitialized) {
      const tx = await factory.initialize(initMessage, {});
      await tx.wait();
      console.log("✅ StreamFactory initialized successfully!");
    } else {
      console.log("ℹ️  StreamFactory already initialized");
    }

    // Print deployment summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT COMPLETE");
    console.log("=".repeat(60));
    console.log(`Network: ${chainConfig.name} (${network})`);
    console.log(`StreamFactory: ${streamFactory.address}`);
    console.log(`Basic Impl: ${basicImplAddress}`);
    console.log(`PostActions Impl: ${postImplAddress}`);
    console.log(`Token Factory: ${tokenFactory.address}`);
    console.log(`Vesting Factory: ${vestingFactoryAddress === ZERO_ADDRESS ? "DISABLED" : vestingFactoryAddress}`);
    console.log(
      `Pool Router: ${poolRouterAddress === ZERO_ADDRESS ? "DISABLED" : poolRouterAddress}`,
    );
    if (poolRouterAddress !== ZERO_ADDRESS) {
      console.log(
        `V2 Wrapper: ${v2PoolWrapperAddress === ZERO_ADDRESS ? "DISABLED" : v2PoolWrapperAddress
        }`,
      );
      console.log(
        `V3 Wrapper: ${v3PoolWrapperAddress === ZERO_ADDRESS ? "DISABLED" : v3PoolWrapperAddress
        }`,
      );
      console.log(
        `Aerodrome Wrapper: ${aerodromePoolWrapperAddress === ZERO_ADDRESS ? "DISABLED" : aerodromePoolWrapperAddress
        }`,
      );
    }

    if (chainConfig.blockExplorer) {
      console.log(`\n🔍 Verify on Block Explorer:`);
      console.log(`${chainConfig.blockExplorer}/address/${streamFactory.address}`);
    }
    console.log("=".repeat(60) + "\n");
  } catch (error: unknown) {
    console.error("\n❌ Deployment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export default func;
func.tags = ["stream-factory"];
func.dependencies = ["tokens"];


