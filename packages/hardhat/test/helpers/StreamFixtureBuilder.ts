import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, TransactionRequest } from "ethers";
import { DecimalStruct, StreamTypes } from "../../typechain-types/src/Stream";
import { StreamFactoryTypes } from "../../typechain-types/src/StreamFactory";
import { MockUniswapV2Factory, MockUniswapV2Router02 } from "../../typechain-types";

interface StreamTimeConfig {
  waitSeconds: number;
  bootstrappingDuration: number;
  streamDuration: number;
}

interface StreamAmountConfig {
  streamOutAmount: bigint;
  threshold: bigint;
}

interface StreamMetadataConfig {
  name: string;
  tosVersion: string;
}

interface StreamVestingConfig {
  creator: StreamTypes.VestingInfoStruct;
  beneficiary: StreamTypes.VestingInfoStruct;
}

interface PoolConfig {
  poolOutSupplyAmount: bigint;
}

interface FactoryConfig {
  streamCreationFee: number;
  streamCreationFeeToken: string;
  exitFeeRatio: DecimalStruct;
  minWaitingDuration: number;
  minBootstrappingDuration: number;
  minStreamDuration: number;
}

export class StreamFixtureBuilder {
  private timeConfig: StreamTimeConfig = {
    waitSeconds: 50,
    bootstrappingDuration: 50,
    streamDuration: 100,
  };

  private amountConfig: StreamAmountConfig = {
    streamOutAmount: ethers.parseEther("1000"),
    threshold: ethers.parseEther("100"),
  };

  private metadataConfig: StreamMetadataConfig = {
    name: "Test Stream",
    tosVersion: "1.0.0",
  };

  private vestingConfig: StreamVestingConfig = {
    creator: {
      vestingDuration: 0,
      isVestingEnabled: false,
    },
    beneficiary: {
      vestingDuration: 0,
      isVestingEnabled: false,
    },
  };

  private poolConfig: PoolConfig = {
    poolOutSupplyAmount: ethers.parseEther("0"),
  };

  private factoryConfig: FactoryConfig = {
    streamCreationFee: 0,
    streamCreationFeeToken: ethers.ZeroAddress,
    exitFeeRatio: { value: 1e5 }, // 1%
    minWaitingDuration: 1,
    minBootstrappingDuration: 1,
    minStreamDuration: 1,
  };

  private nowSeconds?: number;

  // Time configuration methods
  public timeParams(waitSeconds: number, bootstrappingDuration: number, streamDuration: number): StreamFixtureBuilder {
    this.timeConfig = { waitSeconds, bootstrappingDuration, streamDuration };
    return this;
  }

  // Amount configuration methods
  public streamOut(amount: bigint): StreamFixtureBuilder {
    this.amountConfig.streamOutAmount = amount;
    return this;
  }

  public setThreshold(threshold: bigint): StreamFixtureBuilder {
    this.amountConfig.threshold = threshold;
    return this;
  }

  // Metadata configuration methods
  public name(name: string): StreamFixtureBuilder {
    this.metadataConfig.name = name;
    return this;
  }

  public tos(version: string): StreamFixtureBuilder {
    this.metadataConfig.tosVersion = version;
    return this;
  }

  // Vesting configuration methods
  public creatorVesting(vestingDuration: number): StreamFixtureBuilder {
    this.vestingConfig.creator = {
      vestingDuration,
      isVestingEnabled: true,
    };
    return this;
  }

  public beneficiaryVesting(vestingDuration: number): StreamFixtureBuilder {
    this.vestingConfig.beneficiary = {
      vestingDuration,
      isVestingEnabled: true,
    };
    return this;
  }

  // Pool configuration methods
  public poolOutSupply(amount: bigint): StreamFixtureBuilder {
    this.poolConfig.poolOutSupplyAmount = amount;
    return this;
  }

  // Factory configuration methods
  public factoryFee(fee: number, token: string = ethers.ZeroAddress): StreamFixtureBuilder {
    this.factoryConfig.streamCreationFee = fee;
    this.factoryConfig.streamCreationFeeToken = token;
    return this;
  }

  public exitRatio(ratio: number): StreamFixtureBuilder {
    this.factoryConfig.exitFeeRatio = { value: ratio };
    return this;
  }

  public minDurations(waiting: number, bootstrapping: number, stream: number): StreamFixtureBuilder {
    this.factoryConfig.minWaitingDuration = waiting;
    this.factoryConfig.minBootstrappingDuration = bootstrapping;
    this.factoryConfig.minStreamDuration = stream;
    return this;
  }

  // Time manipulation method
  public currentTime(timestamp: number): StreamFixtureBuilder {
    this.nowSeconds = timestamp;
    return this;
  }

  // Build method
  public build() {
    const self = this;
    return async function deployStreamFixture() {
      try {
        // Reset the Hardhat Network
        await ethers.provider.send("hardhat_reset", []);

        // Get signers
        const [deployer, creator, subscriber1, subscriber2, subscriber3, subscriber4, protocolAdmin, feeCollector] =
          await ethers.getSigners();

        // Deploy token contracts with deployer
        const InSupplyToken = await ethers.getContractFactory("ERC20Mock");
        const inSupplyToken = await InSupplyToken.deploy("StreamInSupply Token", "IN");
        const inSupplyTokenAddress = await inSupplyToken.getAddress();

        const OutSupplyToken = await ethers.getContractFactory("ERC20Mock");
        const outSupplyToken = await OutSupplyToken.deploy("StreamOutSupply Token", "OUT");
        const outSupplyTokenAddress = await outSupplyToken.getAddress();

        const FeeToken = await ethers.getContractFactory("ERC20Mock");
        const feeToken = await FeeToken.deploy("Fee Token", "FEE");
        const feeTokenAddress = await feeToken.getAddress();

        // Deploy Uniswap V2 mock contracts
        const UniswapV2FactoryFactory = await ethers.getContractFactory("MockUniswapV2Factory");
        const uniswapV2Factory = (await UniswapV2FactoryFactory.deploy()) as unknown as MockUniswapV2Factory;
        const uniswapV2FactoryAddress = await uniswapV2Factory.getAddress();

        const UniswapV2RouterFactory = await ethers.getContractFactory("MockUniswapV2Router02");
        const uniswapV2Router = (await UniswapV2RouterFactory.deploy(uniswapV2FactoryAddress)) as unknown as MockUniswapV2Router02;
        const uniswapV2RouterAddress = await uniswapV2Router.getAddress();

        // Deploy pool wrapper contract
        const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
        const poolWrapper = await PoolWrapperFactory.deploy(uniswapV2FactoryAddress, uniswapV2RouterAddress);
        const poolWrapperAddress = await poolWrapper.getAddress();

        // Deploy StreamFactory
        const StreamFactoryFactory = await ethers.getContractFactory("StreamFactory");
        const streamFactory = await StreamFactoryFactory.deploy(protocolAdmin.address);
        const streamFactoryAddress = await streamFactory.getAddress();

        // Deploy Stream Implementation
        const StreamImplementationFactory = await ethers.getContractFactory("Stream");
        const streamImplementation = await StreamImplementationFactory.deploy(streamFactoryAddress);
        const streamImplementationAddress = await streamImplementation.getAddress();

        // Initialize Stream Factory
        const streamFactoryMessage: StreamFactoryTypes.InitializeStreamMessageStruct = {
          streamCreationFee: self.factoryConfig.streamCreationFee,
          streamCreationFeeToken: feeTokenAddress,
          exitFeeRatio: self.factoryConfig.exitFeeRatio,
          minWaitingDuration: self.factoryConfig.minWaitingDuration,
          minBootstrappingDuration: self.factoryConfig.minBootstrappingDuration,
          minStreamDuration: self.factoryConfig.minStreamDuration,
          feeCollector: feeCollector.address,
          protocolAdmin: protocolAdmin.address,
          tosVersion: self.metadataConfig.tosVersion,
          acceptedInSupplyTokens: [inSupplyTokenAddress],
          poolWrapperAddress: poolWrapperAddress,
          streamImplementationAddress: streamImplementationAddress,
        };

        await streamFactory.connect(protocolAdmin).initialize(streamFactoryMessage);

        // Get factory params
        const factoryParams = await streamFactory.getParams();
        const streamCreationFee = factoryParams.streamCreationFee;
        const streamCreationFeeToken = factoryParams.streamCreationFeeToken;

        // Mint tokens
        await feeToken.mint(creator.address, ethers.parseEther("1000000000"));
        await outSupplyToken.mint(creator.address, self.amountConfig.streamOutAmount);
        await inSupplyToken.mint(subscriber1.address, ethers.parseEther("1000000000"));
        await inSupplyToken.mint(subscriber2.address, ethers.parseEther("1000000000"));
        await inSupplyToken.mint(subscriber3.address, ethers.parseEther("1000000000"));
        await inSupplyToken.mint(subscriber4.address, ethers.parseEther("1000000000"));

        // Mint pool tokens if needed
        if (self.poolConfig.poolOutSupplyAmount > 0) {
          await outSupplyToken.mint(creator.address, self.poolConfig.poolOutSupplyAmount);
        }

        // Approve tokens
        await outSupplyToken
          .connect(creator)
          .approve(
            await streamFactory.getAddress(),
            self.amountConfig.streamOutAmount + self.poolConfig.poolOutSupplyAmount,
          );

        const txOptions: TransactionRequest = {
          value: 0,
        };

        // If stream creation fee is set, we need to approve the stream factory to spend the creation fee token
        if (streamCreationFee > 0) {
          // Approve fee token
          await feeToken.connect(creator).approve(await streamFactory.getAddress(), streamCreationFee);
        }

        // Set up stream times
        const nowSeconds =
          self.nowSeconds ?? (await ethers.provider.getBlock("latest"))?.timestamp ?? Math.floor(Date.now() / 1000);
        const bootstrappingStartTime = nowSeconds + self.timeConfig.waitSeconds;
        const streamStartTime = bootstrappingStartTime + self.timeConfig.bootstrappingDuration;
        const streamEndTime = streamStartTime + self.timeConfig.streamDuration;

        // Create stream
        const tx = await streamFactory.connect(creator).createStream(
          {
            streamOutAmount: self.amountConfig.streamOutAmount,
            outSupplyToken: outSupplyTokenAddress,
            bootstrappingStartTime,
            streamStartTime,
            streamEndTime,
            threshold: self.amountConfig.threshold,
            metadata: { ipfsHash: "QmS4ghgMgPXqX53EiQ7sP8G6QY8Y5X53EiQ7sP8G6Q" },
            inSupplyToken: inSupplyTokenAddress,
            creator: creator.address,
            creatorVesting: self.vestingConfig.creator,
            beneficiaryVesting: self.vestingConfig.beneficiary,
            poolInfo: {
              poolOutSupplyAmount: self.poolConfig.poolOutSupplyAmount,
            },
            tosVersion: self.metadataConfig.tosVersion,
          },
          txOptions,
        );

        // Get stream address from event
        const receipt = await tx.wait();
        const event = receipt?.logs.find(
          log => log.topics[0] === streamFactory.interface.getEvent("StreamCreated").topicHash,
        );

        if (!event) {
          throw new Error("StreamCreated event not found in transaction logs");
        }

        const parsedEvent = streamFactory.interface.parseLog({
          topics: event.topics,
          data: event.data,
        });

        const streamAddress = parsedEvent?.args.streamAddress || ethers.ZeroAddress;

        if (streamAddress === ethers.ZeroAddress) {
          throw new Error("Invalid stream address (zero address)");
        }

        const stream = await ethers.getContractAt("Stream", streamAddress);

        return {
          contracts: {
            stream,
            streamFactory,
            inSupplyToken,
            outSupplyToken,
            poolWrapper,
          },
          accounts: {
            deployer,
            protocolAdmin,
            feeCollector,
            creator,
            subscriber1,
            subscriber2,
            subscriber3,
            subscriber4,
          },
          timeParams: {
            bootstrappingStartTime,
            streamStartTime,
            streamEndTime,
            nowSeconds,
          },
          config: {
            streamOutAmount: self.amountConfig.streamOutAmount,
            threshold: self.amountConfig.threshold,
            creatorVestingInfo: self.vestingConfig.creator,
            beneficiaryVestingInfo: self.vestingConfig.beneficiary,
            poolConfig: self.poolConfig,
            exitFeeRatio: self.factoryConfig.exitFeeRatio,
          },
          factoryParams: {
            streamCreationFee: self.factoryConfig.streamCreationFee,
            streamCreationFeeToken: self.factoryConfig.streamCreationFeeToken,
            exitFeeRatio: self.factoryConfig.exitFeeRatio,
            minWaitingDuration: self.factoryConfig.minWaitingDuration,
            minBootstrappingDuration: self.factoryConfig.minBootstrappingDuration,
            minStreamDuration: self.factoryConfig.minStreamDuration,
            tosVersion: self.metadataConfig.tosVersion,
          },
          uniswapV2Factory: uniswapV2Factory as any,
          uniswapV2Router: uniswapV2Router as any,
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
