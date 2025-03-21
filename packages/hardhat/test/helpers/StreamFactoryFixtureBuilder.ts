// packages/hardhat/test/helpers/FactoryFixtureBuilder.ts
import { ethers } from "hardhat";
import { StreamFactory, ERC20Mock } from "../../typechain-types";

export class StreamFactoryFixtureBuilder {
    private streamCreationFee: number = 100;
    private exitFeePercent: number = 100; // 1% (scaled by 10000)
    private minWaitingDuration: number = 60; // 1 minute
    private minBootstrappingDuration: number = 60 * 60 * 24; // 24 hours
    private minStreamDuration: number = 60 * 60 * 24 * 7; // 7 days
    private tosVersion: string = "1.0";

    // Method to set stream creation fee
    public fee(amount: number): StreamFactoryFixtureBuilder {
        this.streamCreationFee = amount;
        return this;
    }

    // Method to set exit fee percent
    public exitPercent(percent: number): StreamFactoryFixtureBuilder {
        this.exitFeePercent = percent;
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
            exitFeePercent: this.exitFeePercent,
            minWaitingDuration: this.minWaitingDuration,
            minBootstrappingDuration: this.minBootstrappingDuration,
            minStreamDuration: this.minStreamDuration,
            tosVersion: this.tosVersion
        };

        // Return the fixture function
        return async function deployFactoryFixture() {
            // Get signers
            const [owner, feeCollector, protocolAdmin] = await ethers.getSigners();

            // Deploy token contracts
            const InSupplyToken = await ethers.getContractFactory("ERC20Mock");
            const inSupplyToken = await InSupplyToken.deploy("InSupply Token", "IN");

            const OutSupplyToken = await ethers.getContractFactory("ERC20Mock");
            const outSupplyToken = await OutSupplyToken.deploy("OutSupply Token", "OUT");

            // Mint tokens to the owner
            await inSupplyToken.mint(owner.address, 1000000000000);
            await outSupplyToken.mint(owner.address, 1000000000000);

            // List of accepted tokens
            const acceptedInSupplyTokens = [await inSupplyToken.getAddress()];
            const feeCollectorAddress = await feeCollector.getAddress();
            const protocolAdminAddress = await protocolAdmin.getAddress();

            // Deploy factory
            const StreamFactory = await ethers.getContractFactory("StreamFactory");
            const factory = await StreamFactory.deploy(
                config.streamCreationFee,
                await inSupplyToken.getAddress(), // Use the token as fee token
                config.exitFeePercent,
                config.minWaitingDuration,
                config.minBootstrappingDuration,
                config.minStreamDuration,
                acceptedInSupplyTokens,
                feeCollectorAddress,
                protocolAdminAddress,
                config.tosVersion
            );

            return {
                factory,
                owner,
                feeCollector,
                protocolAdmin,
                inSupplyToken,
                outSupplyToken,
                config
            };
        };
    }
}

// Factory function to create a new builder
export function streamFactory(): StreamFactoryFixtureBuilder {
    return new StreamFactoryFixtureBuilder();
}