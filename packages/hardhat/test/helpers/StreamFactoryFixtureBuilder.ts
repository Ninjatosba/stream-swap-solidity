// packages/hardhat/test/helpers/StreamFactoryFixtureBuilder.ts
import { ethers } from "hardhat";
import { StreamFactory, ERC20Mock, Stream, PoolWrapper } from "../../typechain-types";
import { DecimalStruct } from "../../typechain-types/contracts/PositionStorage";
import { StreamFactoryTypes } from "../../typechain-types/contracts/StreamFactory";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface StreamFactoryFixture {
    contracts: {
        streamFactory: StreamFactory;
        streamImplementation: Stream;
        inSupplyToken: ERC20Mock;
        outSupplyToken: ERC20Mock;
        poolWrapper: PoolWrapper;
    };
    accounts: {
        creator: HardhatEthersSigner;
        feeCollector: HardhatEthersSigner;
        protocolAdmin: HardhatEthersSigner;
    };
    config: {
        streamCreationFee: number;
        ExitFeeRatio: DecimalStruct;
        minWaitingDuration: number;
        minBootstrappingDuration: number;
        minStreamDuration: number;
        tosVersion: string;
    };
}

export class StreamFactoryFixtureBuilder {
    private streamCreationFee: number = 0;
    private ExitFeeRatio: DecimalStruct = {
        value: 100n // 1% (scaled by 10000)
    };
    private minWaitingDuration: number = 1; // 1 second
    private minBootstrappingDuration: number = 1; // 1 second
    private minStreamDuration: number = 1; // 1 second
    private tosVersion: string = "1.0";
    private initialTokenSupply: bigint = ethers.parseEther("100000");

    // Method to set stream creation fee
    public fee(amount: number): StreamFactoryFixtureBuilder {
        if (amount < 0) throw new Error("Fee cannot be negative");
        this.streamCreationFee = amount;
        return this;
    }

    // Method to set exit fee percent
    public exitPercent(percent: number): StreamFactoryFixtureBuilder {
        if (percent < 0 || percent > 100) throw new Error("Exit percent must be between 0 and 100");
        this.ExitFeeRatio = {
            value: BigInt(percent * 1e5)
        };
        return this;
    }

    // Method to set minimum durations
    public minDurations(
        waiting: number,
        bootstrapping: number,
        stream: number
    ): StreamFactoryFixtureBuilder {
        if (waiting < 0 || bootstrapping < 0 || stream < 0) {
            throw new Error("Durations cannot be negative");
        }
        this.minWaitingDuration = waiting;
        this.minBootstrappingDuration = bootstrapping;
        this.minStreamDuration = stream;
        return this;
    }

    // Method to set TOS version
    public tos(version: string): StreamFactoryFixtureBuilder {
        if (!version) throw new Error("TOS version cannot be empty");
        this.tosVersion = version;
        return this;
    }

    // Method to set initial token supply
    public initialSupply(amount: bigint): StreamFactoryFixtureBuilder {
        if (amount <= 0n) throw new Error("Initial supply must be positive");
        this.initialTokenSupply = amount;
        return this;
    }

    // Build method that returns the fixture function
    public build(): () => Promise<StreamFactoryFixture> {
        // Store the current configuration in variables that will be captured in the closure
        const config = {
            streamCreationFee: this.streamCreationFee,
            ExitFeeRatio: this.ExitFeeRatio,
            minWaitingDuration: this.minWaitingDuration,
            minBootstrappingDuration: this.minBootstrappingDuration,
            minStreamDuration: this.minStreamDuration,
            tosVersion: this.tosVersion
        };

        const initialSupply = this.initialTokenSupply;

        // Return the fixture function
        return async function deployFactoryFixture(): Promise<StreamFactoryFixture> {
            const [creator, feeCollector, protocolAdmin] = await ethers.getSigners();

            try {
                // Deploy token contracts
                const InSupplyToken = await ethers.getContractFactory("ERC20Mock");
                const inSupplyToken = await InSupplyToken.deploy("InSupply Token", "IN");
                await inSupplyToken.waitForDeployment();

                const OutSupplyToken = await ethers.getContractFactory("ERC20Mock");
                const outSupplyToken = await OutSupplyToken.deploy("OutSupply Token", "OUT");
                await outSupplyToken.waitForDeployment();

                // Mint tokens to the creator
                await inSupplyToken.mint(creator.address, initialSupply);
                await outSupplyToken.mint(creator.address, initialSupply);

                // Deploy pool wrapper contract
                const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
                const poolWrapper = await PoolWrapperFactory.deploy();
                await poolWrapper.waitForDeployment();

                // Deploy StreamFactory implementation first
                const StreamFactoryImplementation = await ethers.getContractFactory("StreamFactory");
                const factoryImplementation = await StreamFactoryImplementation.deploy(protocolAdmin.address);
                await factoryImplementation.waitForDeployment();

                // Deploy StreamFactory proxy
                const StreamFactoryProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
                const factoryProxy = await StreamFactoryProxy.deploy(
                    await factoryImplementation.getAddress(),
                    protocolAdmin.address,
                    "0x" // No initialization data yet
                );
                await factoryProxy.waitForDeployment();

                // Get the StreamFactory interface through the proxy
                const streamFactory = StreamFactoryImplementation.attach(await factoryProxy.getAddress()) as StreamFactory;

                // Deploy Stream implementation
                const StreamImplementationFactory = await ethers.getContractFactory("Stream");
                const streamImplementation = await StreamImplementationFactory.deploy(await streamFactory.getAddress());
                await streamImplementation.waitForDeployment();

                // Initialize the factory through the proxy
                const initMessage: StreamFactoryTypes.InitializeStreamMessageStruct = {
                    streamCreationFee: config.streamCreationFee,
                    streamCreationFeeToken: await inSupplyToken.getAddress(),
                    exitFeeRatio: config.ExitFeeRatio,
                    minWaitingDuration: config.minWaitingDuration,
                    minBootstrappingDuration: config.minBootstrappingDuration,
                    minStreamDuration: config.minStreamDuration,
                    feeCollector: feeCollector.address,
                    protocolAdmin: protocolAdmin.address,
                    tosVersion: config.tosVersion,
                    acceptedInSupplyTokens: [await inSupplyToken.getAddress()],
                    poolWrapperAddress: await poolWrapper.getAddress(),
                    streamImplementationAddress: await streamImplementation.getAddress()
                };

                // Initialize with proper error handling
                const tx = await streamFactory.connect(protocolAdmin).initialize(initMessage);
                await tx.wait();

                return {
                    contracts: {
                        streamFactory,
                        streamImplementation,
                        inSupplyToken,
                        outSupplyToken,
                        poolWrapper,
                    },
                    accounts: {
                        creator,
                        feeCollector,
                        protocolAdmin,
                    },
                    config,
                };

            } catch (error) {
                console.error("Error in deployFactoryFixture:", error);
                throw error;
            }
        };
    }
}

// Factory function to create a new builder
export function streamFactory(): StreamFactoryFixtureBuilder {
    return new StreamFactoryFixtureBuilder();
}