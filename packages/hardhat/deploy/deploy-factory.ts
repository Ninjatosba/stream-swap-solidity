import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { createFactoryConfig, createProductionFactoryConfig, createTestnetFactoryConfig, FactoryConfig } from "./config/factory-config";
import { StreamFactoryTypes } from "../typechain-types/contracts/StreamFactory";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deploy, get } = hre.deployments;

    // Get config from environment or use default
    let config: FactoryConfig;

    // Get environment from args
    const environment = process.argv.indexOf("--network") !== -1 ? process.argv[process.argv.indexOf("--network") + 1] : "default";

    // get in token address
    let inTokenAddress;
    try {
        const inTokenDeployment = await get("InToken");
        inTokenAddress = inTokenDeployment.address;
        console.log(`Found in token at: ${inTokenAddress}`);
    } catch (error) {
        console.error("in token not found. Please deploy it first.");
        throw new Error("in token not deployed");
    }

    switch (environment) {
        case "sepolia":
            config = createTestnetFactoryConfig(deployer, inTokenAddress);
            break;
        case "production":
            config = createProductionFactoryConfig(deployer, inTokenAddress);
            break;
        default:
            config = createFactoryConfig(deployer, [inTokenAddress]);
    }

    // Deploy pool wrapper
    const poolWrapper = await deploy("PoolWrapper", {
        from: deployer,
        args: [],
        log: true,
        skipIfAlreadyDeployed: false,
        deterministicDeployment: false,
    });
    const poolWrapperAddress = poolWrapper.address;
    console.log(`PoolWrapper contract deployed at: ${poolWrapperAddress}`);
    console.log(`Deployer: ${deployer}`);

    try {
        // Deploy StreamFactory with just the protocol admin
        const streamFactory = await deploy("StreamFactory", {
            from: deployer,
            args: [deployer],
            log: true,
            skipIfAlreadyDeployed: false,
            deterministicDeployment: false,
            gasLimit: 30_000_000,
        });
        console.log(`StreamFactory contract deployed at: ${streamFactory.address}`);

        // Deploy Stream implementation
        const streamImplementation = await deploy("Stream", {
            from: deployer,
            args: [streamFactory.address],
            log: true,
            skipIfAlreadyDeployed: false,
            deterministicDeployment: false,
        });
        console.log(`Stream implementation deployed at: ${streamImplementation.address}`);

        // Get contract instance for initialization
        const StreamFactory = await hre.ethers.getContractFactory("StreamFactory");

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
            streamImplementationAddress: streamImplementation.address
        };

        // Initialize the factory
        const factory = StreamFactory.attach(streamFactory.address);
        const tx = await factory.initialize(initMessage);
        await tx.wait();
        console.log(`StreamFactory initialized with ${environment} configuration`);
        console.log(`Factory params: ${JSON.stringify(initMessage)}`);

    } catch (error: unknown) {
        console.error("Deployment failed:", error instanceof Error ? error.message : error);
        throw error;
    }
};

export default func;
func.tags = ["stream-factory"];
func.dependencies = ["tokens"];
