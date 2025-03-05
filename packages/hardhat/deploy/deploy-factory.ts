import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { createFactoryConfig, createProductionFactoryConfig, createTestnetFactoryConfig, FactoryConfig } from "./config/factory-config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deploy, get } = hre.deployments;

    // Get config from environment or use default
    let config: FactoryConfig;

    // Get environment from args
    const environment = process.argv.indexOf("--network") !== -1 ? process.argv[process.argv.indexOf("--network") + 1] : "default";

    // get in denom address
    let inDenomAddress;
    try {
        const inDenomDeployment = await get("InDenomToken");
        inDenomAddress = inDenomDeployment.address;
        console.log(`Found inDenom token at: ${inDenomAddress}`);
    } catch (error) {
        console.error("inDenom token not found. Please deploy it first.");
        throw new Error("inDenom token not deployed");
    }



    switch (environment) {
        case "sepolia":
            config = createTestnetFactoryConfig(deployer, inDenomAddress);
            break;
        case "production":
            config = createProductionFactoryConfig(deployer, inDenomAddress);
            break;
        default:
            config = createFactoryConfig(deployer, [inDenomAddress]);
    }
    try {
        // Deploy StreamFactory contract
        const streamFactory = await deploy("StreamFactory", {
            from: deployer,
            args: [
                config.streamCreationFee,
                config.streamCreationFeeToken,
                config.exitFeePercent,
                config.minWaitingDuration,
                config.minBootstrappingDuration,
                config.minStreamDuration,
                config.acceptedInDenoms,
                config.feeCollector,
                config.protocolAdmin,
                config.tosVersion
            ],
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

