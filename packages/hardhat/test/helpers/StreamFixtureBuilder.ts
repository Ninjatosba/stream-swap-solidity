import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

export class StreamFixtureBuilder {
    private streamOutAmount: number = 1000;
    private waitSeconds: number = 50;
    private bootstrappingDuration: number = 50;
    private streamDuration: number = 100;
    private threshold: number = 1000;
    private streamName: string = "Test Stream";
    private tosVersion: string = "1.0.0";
    private exitFeePercent: number = 1e5;
    private minWaitingDuration: number = 1;
    private minBootstrappingDuration: number = 1;
    private minStreamDuration: number = 1;
    private nowSeconds?: number;
    private streamCreationFee: number = 100;

    // Method to set stream out amount
    public streamOut(amount: number): StreamFixtureBuilder {
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
    public setThreshold(threshold: number): StreamFixtureBuilder {
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
    public exitPercent(percent: number): StreamFixtureBuilder {
        this.exitFeePercent = percent;
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
            exitFeePercent: this.exitFeePercent,
            minWaitingDuration: this.minWaitingDuration,
            minBootstrappingDuration: this.minBootstrappingDuration,
            minStreamDuration: this.minStreamDuration,
            nowSeconds: this.nowSeconds,
            streamCreationFee: this.streamCreationFee
        };

        // Return the fixture function
        return async function deployStreamFixture() {
            try {
                // Reset the Hardhat Network
                await ethers.provider.send("hardhat_reset", []);

                // Get signers
                const [deployer, subscriber1, subscriber2] = await ethers.getSigners();

                // Deploy token contracts
                const InDenom = await ethers.getContractFactory("ERC20Mock");
                const inDenom = await InDenom.deploy("InDenom Token", "IN");

                const OutDenom = await ethers.getContractFactory("ERC20Mock");
                const outDenom = await OutDenom.deploy("StreamOutDenom Token", "OUT");

                // Mint tokens for stream creator
                await outDenom.mint(deployer.address, config.streamOutAmount);
                // Mint tokens for subscribers
                await inDenom.mint(subscriber1.address, 100_000_000);
                await inDenom.mint(subscriber2.address, 100_000_000);


                // Deploy StreamFactory
                const StreamFactoryFactory = await ethers.getContractFactory("StreamFactory");
                const streamFactory = await StreamFactoryFactory.deploy(
                    config.streamCreationFee,
                    ethers.ZeroAddress,
                    config.exitFeePercent,
                    config.minWaitingDuration,
                    config.minBootstrappingDuration,
                    config.minStreamDuration,
                    [await inDenom.getAddress()],
                    deployer.address,
                    deployer.address,
                    config.tosVersion
                );

                // Approve tokens
                await outDenom.approve(await streamFactory.getAddress(), config.streamOutAmount);

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

                // Create stream
                const tx = await streamFactory.createStream(
                    config.streamOutAmount,
                    await outDenom.getAddress(),
                    bootstrappingStartTime,
                    streamStartTime,
                    streamEndTime,
                    config.threshold,
                    config.streamName,
                    await inDenom.getAddress(),
                    config.tosVersion,
                    ethers.getBytes("0x0000000000000000000000000000000000000000000000000000000000000000"),
                    { value: config.streamCreationFee }
                );

                // Get stream address from event
                const receipt = await tx.wait();
                const streamFactoryInterface = new ethers.Interface([
                    "event StreamCreated(uint256 indexed streamOutAmount, uint256 indexed bootstrappingStartTime, uint256 streamStartTime, uint256 streamEndTime, address indexed streamAddress)"
                ]);

                const parsedLog = receipt?.logs
                    .map((log: any) => {
                        try {
                            return streamFactoryInterface.parseLog({
                                topics: log.topics as string[],
                                data: log.data
                            });
                        } catch {
                            return null;
                        }
                    })
                    .find((log: any) => log !== null);

                const streamAddress = parsedLog ? ethers.getAddress(parsedLog.args[4]) : ethers.ZeroAddress;

                // Connect to stream contract
                const stream = await ethers.getContractAt("Stream", streamAddress);

                // Return structured result
                return {
                    contracts: {
                        stream,
                        streamFactory,
                        inDenom,
                        outDenom
                    },
                    accounts: {
                        deployer,
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
                        threshold: config.threshold
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