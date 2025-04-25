import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";
import { DecimalStruct } from "../../typechain-types/contracts/PositionStorage";
import { VestingInterface } from "../../typechain-types/contracts/Vesting";
import { StreamFactoryTypes } from "../../typechain-types/contracts/StreamFactory";
import { StreamTypes } from "../../typechain-types/contracts/Stream";

export class StreamFixtureBuilder {
    private streamOutAmount: bigint = ethers.parseEther("1000")
    private waitSeconds: number = 50;
    private bootstrappingDuration: number = 50;
    private streamDuration: number = 100;
    private threshold: bigint = ethers.parseEther("10");
    private streamName: string = "Test Stream";
    private tosVersion: string = "1.0.0";
    private ExitFeeRatio: DecimalStruct = {
        // 1%
        value: 1e5
    };
    private minWaitingDuration: number = 1;
    private minBootstrappingDuration: number = 1;
    private minStreamDuration: number = 1;
    private nowSeconds?: number;
    private streamCreationFee: number = 0;
    private creatorVestingInfo: StreamTypes.VestingInfoStruct = {
        cliffDuration: 0,
        vestingDuration: 0,
        isVestingEnabled: false
    };
    private beneficiaryVestingInfo: StreamTypes.VestingInfoStruct = {
        cliffDuration: 0,
        vestingDuration: 0,
        isVestingEnabled: false
    };

    // Method to set stream out amount
    public streamOut(amount: bigint): StreamFixtureBuilder {
        this.streamOutAmount = amount;
        return this;
    }

    // Method to set time parameters
    public timeParams(waitSeconds: number, bootstrappingDuration: number, streamDuration: number): StreamFixtureBuilder {
        this.waitSeconds = waitSeconds;
        this.bootstrappingDuration = bootstrappingDuration;
        this.streamDuration = streamDuration;
        return this;
    }
    // Method to set threshold
    public setThreshold(threshold: bigint): StreamFixtureBuilder {
        this.threshold = threshold;
        return this;
    }

    // Method to set stream name
    public name(name: string): StreamFixtureBuilder {
        this.streamName = name;
        return this;
    }

    // Method to set version
    public tos(version: string): StreamFixtureBuilder {
        this.tosVersion = version;
        return this;
    }

    // Method to set factory fee
    public factoryFee(fee: number): StreamFixtureBuilder {
        this.streamCreationFee = fee;
        return this;
    }

    // Method to set exit fee percent
    public exitRatio(ratio: number): StreamFixtureBuilder {
        this.ExitFeeRatio = {
            value: ratio
        };
        return this;
    }

    // Method to set minimum durations
    public minDurations(waiting: number, bootstrapping: number, stream: number): StreamFixtureBuilder {
        this.minWaitingDuration = waiting;
        this.minBootstrappingDuration = bootstrapping;
        this.minStreamDuration = stream;
        return this;
    }

    // Method to set a custom current time
    public currentTime(timestamp: number): StreamFixtureBuilder {
        this.nowSeconds = timestamp;
        return this;
    }

    // Method to set creator vesting info
    public creatorVesting(cliffDuration: number, vestingDuration: number): StreamFixtureBuilder {
        this.creatorVestingInfo = {
            cliffDuration,
            vestingDuration,
            isVestingEnabled: true
        };
        return this;
    }

    // Method to set beneficiary vesting info
    public beneficiaryVesting(cliffDuration: number, vestingDuration: number): StreamFixtureBuilder {
        this.beneficiaryVestingInfo = {
            cliffDuration,
            vestingDuration,
            isVestingEnabled: true
        };
        return this;
    }

    // Build method that returns the fixture function
    public build() {
        // Store the current configuration in variables that will be captured in the closure
        const config = {
            streamOutAmount: this.streamOutAmount,
            waitSeconds: this.waitSeconds,
            bootstrappingDuration: this.bootstrappingDuration,
            streamDuration: this.streamDuration,
            threshold: this.threshold,
            streamName: this.streamName,
            tosVersion: this.tosVersion,
            ExitFeeRatio: this.ExitFeeRatio,
            minWaitingDuration: this.minWaitingDuration,
            minBootstrappingDuration: this.minBootstrappingDuration,
            minStreamDuration: this.minStreamDuration,
            nowSeconds: this.nowSeconds,
            streamCreationFee: this.streamCreationFee,
            creatorVestingInfo: this.creatorVestingInfo,
            beneficiaryVestingInfo: this.beneficiaryVestingInfo
        };

        // Return the fixture function
        return async function deployStreamFixture() {
            try {
                // Reset the Hardhat Network
                await ethers.provider.send("hardhat_reset", []);

                // Get signers
                const [deployer, creator, subscriber1, subscriber2, protocolAdmin, feeCollector] = await ethers.getSigners();

                // Deploy token contracts with deployer
                const InSupplyToken = await ethers.getContractFactory("ERC20Mock");
                const inSupplyToken = await InSupplyToken.deploy("StreamInSupply Token", "IN");

                const OutSupplyToken = await ethers.getContractFactory("ERC20Mock");
                const outSupplyToken = await OutSupplyToken.deploy("StreamOutSupply Token", "OUT");
                // Mint tokens for stream creator
                await outSupplyToken.mint(creator.address, config.streamOutAmount);

                // Mint tokens for subscribers
                await inSupplyToken.mint(subscriber1.address, ethers.parseEther("100"));
                await inSupplyToken.mint(subscriber2.address, ethers.parseEther("100"));

                const streamFactoryMessage: StreamFactoryTypes.ConstructFactoryMessageStruct = {
                    streamCreationFee: config.streamCreationFee,
                    streamCreationFeeToken: ethers.ZeroAddress,
                    exitFeeRatio: config.ExitFeeRatio,
                    minWaitingDuration: config.minWaitingDuration,
                    minBootstrappingDuration: config.minBootstrappingDuration,
                    minStreamDuration: config.minStreamDuration,
                    feeCollector: feeCollector.address,
                    protocolAdmin: protocolAdmin.address,
                    tosVersion: config.tosVersion,
                    acceptedInSupplyTokens: [await inSupplyToken.getAddress()],
                    uniswapV2FactoryAddress: "0x0000000000000000000000000000000000000000",
                    uniswapV2RouterAddress: "0x0000000000000000000000000000000000000000"
                };

                // Deploy StreamFactory with deployer
                const StreamFactoryFactory = await ethers.getContractFactory("StreamFactory");
                const streamFactory = await StreamFactoryFactory.deploy(streamFactoryMessage);


                // IMPORTANT: Creator approves tokens
                await outSupplyToken.connect(creator).approve(
                    await streamFactory.getAddress(),
                    config.streamOutAmount
                );

                // Get current time
                let nowSeconds: number;
                if (config.nowSeconds) {
                    nowSeconds = config.nowSeconds;
                } else {
                    const latestBlock = await ethers.provider.getBlock("latest");
                    nowSeconds = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
                }

                // Set up stream times
                const bootstrappingStartTime = nowSeconds + config.waitSeconds;
                const streamStartTime = bootstrappingStartTime + config.bootstrappingDuration;
                const streamEndTime = streamStartTime + config.streamDuration;

                const createStreamMessage: StreamTypes.CreateStreamMessageStruct = {
                    streamOutAmount: config.streamOutAmount,
                    outSupplyToken: await outSupplyToken.getAddress(),
                    bootstrappingStartTime,
                    streamStartTime,
                    streamEndTime,
                    threshold: config.threshold,
                    name: config.streamName,
                    inSupplyToken: await inSupplyToken.getAddress(),
                    creator: creator.address,
                    creatorVesting: config.creatorVestingInfo,
                    beneficiaryVesting: config.beneficiaryVestingInfo,
                    poolInfo: {
                        poolOutSupplyAmount: 0
                    },
                    salt: ethers.getBytes("0x0000000000000000000000000000000000000000000000000000000000000000"),
                    tosVersion: config.tosVersion
                };

                // Create stream with creator
                const tx = await streamFactory.connect(creator).createStream(
                    createStreamMessage
                );

                // Get stream address from event
                const receipt = await tx.wait();

                // This automatically finds and parses the StreamCreated event
                const event = receipt?.logs.find(
                    log => log.topics[0] === streamFactory.interface.getEvent("StreamCreated").topicHash
                );

                if (!event) {
                    throw new Error("StreamCreated event not found in transaction logs");
                }

                // Parse the event with the contract's interface
                const parsedEvent = streamFactory.interface.parseLog({
                    topics: event.topics,
                    data: event.data
                });

                // Get the stream address directly from the parsed event
                const streamAddress = parsedEvent?.args.streamAddress || ethers.ZeroAddress;

                if (streamAddress === ethers.ZeroAddress) {
                    throw new Error("Invalid stream address (zero address)");
                }

                // Connect to stream contract
                const stream = await ethers.getContractAt("Stream", streamAddress);

                // Return structured result
                return {
                    contracts: {
                        stream,
                        streamFactory,
                        inSupplyToken,
                        outSupplyToken
                    },
                    accounts: {
                        deployer,
                        protocolAdmin,
                        feeCollector,
                        creator,
                        subscriber1,
                        subscriber2
                    },
                    timeParams: {
                        bootstrappingStartTime,
                        streamStartTime,
                        streamEndTime,
                        nowSeconds
                    },
                    config: {
                        streamOutAmount: config.streamOutAmount,
                        threshold: config.threshold,
                        creatorVestingInfo: config.creatorVestingInfo,
                        beneficiaryVestingInfo: config.beneficiaryVestingInfo
                    },
                    factoryParams: {
                        streamCreationFee: config.streamCreationFee,
                        exitFeeRatio: config.ExitFeeRatio,
                        minWaitingDuration: config.minWaitingDuration,
                        minBootstrappingDuration: config.minBootstrappingDuration,
                        minStreamDuration: config.minStreamDuration,
                        tosVersion: config.tosVersion
                    }
                };
            } catch (error) {
                console.error("Error in fixture:", error);
                throw error;
            }
        };
    }
}

// Factory function to create a new builder
export function stream(): StreamFixtureBuilder {
    return new StreamFixtureBuilder();
} 