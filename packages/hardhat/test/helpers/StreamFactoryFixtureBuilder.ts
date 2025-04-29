// packages/hardhat/test/helpers/FactoryFixtureBuilder.ts
import { ethers } from "hardhat";
import { StreamFactory, ERC20Mock } from "../../typechain-types";
import { DecimalStruct } from "../../typechain-types/contracts/PositionStorage";
import { StreamFactoryTypes } from "../../typechain-types/contracts/StreamFactory";

export class StreamFactoryFixtureBuilder {
    private streamCreationFee: number = 0;
    private ExitFeeRatio: DecimalStruct = {
        value: 100
    }; // 1% (scaled by 10000)
    private minWaitingDuration: number = 1; // 1 second
    private minBootstrappingDuration: number = 1; // 1 second
    private minStreamDuration: number = 1; // 1 second
    private tosVersion: string = "1.0";

    // Method to set stream creation fee
    public fee(amount: number): StreamFactoryFixtureBuilder {
        this.streamCreationFee = amount;
        return this;
    }

    // Method to set exit fee percent
    public exitPercent(percent: number): StreamFactoryFixtureBuilder {
        this.ExitFeeRatio = {
            value: percent * 1e5
        };
        return this;
    }

    // Method to set minimum durations
    public minDurations(
        waiting: number,
        bootstrapping: number,
        stream: number
    ): StreamFactoryFixtureBuilder {
        this.minWaitingDuration = waiting;
        this.minBootstrappingDuration = bootstrapping;
        this.minStreamDuration = stream;
        return this;
    }

    // Method to set TOS version
    public tos(version: string): StreamFactoryFixtureBuilder {
        this.tosVersion = version;
        return this;
    }

    // Build method that returns the fixture function
    public build() {
        // Store the current configuration in variables that will be captured in the closure
        const config = {
            streamCreationFee: this.streamCreationFee,
            ExitFeeRatio: this.ExitFeeRatio,
            minWaitingDuration: this.minWaitingDuration,
            minBootstrappingDuration: this.minBootstrappingDuration,
            minStreamDuration: this.minStreamDuration,
            tosVersion: this.tosVersion
        };

        // Return the fixture function
        return async function deployFactoryFixture() {
            // Get signers
            const [creator, feeCollector, protocolAdmin] = await ethers.getSigners();

            // Deploy token contracts
            const InSupplyToken = await ethers.getContractFactory("ERC20Mock");
            const inSupplyToken = await InSupplyToken.deploy("InSupply Token", "IN");

            const OutSupplyToken = await ethers.getContractFactory("ERC20Mock");
            const outSupplyToken = await OutSupplyToken.deploy("OutSupply Token", "OUT");

            // Mint tokens to the creator
            await inSupplyToken.mint(creator.address, ethers.parseEther("100000"));
            await outSupplyToken.mint(creator.address, ethers.parseEther("100000"));

            // List of accepted tokens
            const acceptedInSupplyTokens = [await inSupplyToken.getAddress()];
            const feeCollectorAddress = await feeCollector.getAddress();
            const protocolAdminAddress = await protocolAdmin.getAddress();

            // Deploy pool wrapper contract
            const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
            const poolWrapper = await PoolWrapperFactory.deploy();

            // Deploy factory
            const StreamFactory = await ethers.getContractFactory("StreamFactory");
            const streamFactoryMessage: StreamFactoryTypes.ConstructFactoryMessageStruct = {
                streamCreationFee: config.streamCreationFee,
                streamCreationFeeToken: await inSupplyToken.getAddress(),
                exitFeeRatio: config.ExitFeeRatio,
                minWaitingDuration: config.minWaitingDuration,
                minBootstrappingDuration: config.minBootstrappingDuration,
                minStreamDuration: config.minStreamDuration,
                feeCollector: feeCollectorAddress,
                protocolAdmin: protocolAdminAddress,
                tosVersion: config.tosVersion,
                acceptedInSupplyTokens: acceptedInSupplyTokens,
                poolWrapperAddress: await poolWrapper.getAddress(),
            };
            const factory = await StreamFactory.deploy(streamFactoryMessage);

            return {
                factory,
                protocolAdmin,
                creator,
                feeCollector,
                inSupplyToken,
                outSupplyToken,
                config,

            };
        };
    }
}

// Factory function to create a new builder
export function streamFactory(): StreamFactoryFixtureBuilder {
    return new StreamFactoryFixtureBuilder();
}