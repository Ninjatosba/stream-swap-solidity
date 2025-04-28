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
    try {
        const deployFactoryMessage: StreamFactoryTypes.ConstructFactoryMessageStruct = {
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
            uniswapV2FactoryAddress: config.uniswapV2FactoryAddress || "0x0000000000000000000000000000000000000000",
            uniswapV2RouterAddress: config.uniswapV2RouterAddress || "0x0000000000000000000000000000000000000000",
        };

        // Deploy StreamFactory contract
        const streamFactory = await deploy("StreamFactory", {
            from: deployer,
            args: [deployFactoryMessage],
            log: true,
            skipIfAlreadyDeployed: false,
            deterministicDeployment: false,
        });

        console.log(`StreamFactory contract deployed at: ${streamFactory.address} with ${environment} configuration`);

    } catch (error: unknown) {
        console.error("Deployment failed:", error instanceof Error ? error.message : error);
        throw error;
    }
};

export default func;
func.tags = ["stream-factory"];

