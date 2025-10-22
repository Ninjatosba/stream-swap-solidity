import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, TransactionRequest } from "ethers";
import fs from "fs";
import path from "path";
import { DecimalStruct, StreamTypes } from "../../typechain-types/src/Stream";
import { StreamFactoryTypes } from "../../typechain-types/src/StreamFactory";
import { disableFork, enableMainnetFork } from "./fork";
import { deployV2PoolWrapperFork, deployV3PoolWrapperFork } from "./poolWrappers";

// Configuration interfaces
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
    threshold: ethers.parseEther("0"),
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

  // Simplified token configuration
  private inSupplyTokenAddress?: string;
  private outSupplyTokenAddress?: string;
  private feeTokenAddress?: string;

  private nowSeconds?: number;
  private enablePoolCreationFlag: boolean = false;
  private selectedDexType: 0 | 1 = 0; // 0: V2, 1: V3
  private forkBlock?: number;

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

  // Simplified token configuration - single method handles both ERC20 and native
  public tokens(inSupplyToken?: string, outSupplyToken?: string, feeToken?: string): StreamFixtureBuilder {
    this.inSupplyTokenAddress = inSupplyToken;
    this.outSupplyTokenAddress = outSupplyToken;
    this.feeTokenAddress = feeToken;
    return this;
  }

  // Convenience method for native token
  public nativeToken(): StreamFixtureBuilder {
    return this.tokens(ethers.ZeroAddress);
  }

  // Time manipulation method
  public currentTime(timestamp: number): StreamFixtureBuilder {
    this.nowSeconds = timestamp;
    return this;
  }

  // Pool creation toggle (defaults to false)
  public enablePoolCreation(enabled: boolean): StreamFixtureBuilder {
    this.enablePoolCreationFlag = enabled;
    return this;
  }

  // Select DEX type for pool creation (defaults to V2)
  public dex(type: "v2" | "v3"): StreamFixtureBuilder {
    this.selectedDexType = type === "v2" ? 0 : 1;
    return this;
  }

  // Optionally pin fork block for reproducibility
  public forkAt(blockNumber?: number): StreamFixtureBuilder {
    this.forkBlock = blockNumber;
    return this;
  }

  // Build method
  public build() {
    const self = this;
    return async function deployStreamFixture() {
      try {
        // Reset or enable fork depending on pool creation flag
        if (self.enablePoolCreationFlag) {
          await enableMainnetFork(self.forkBlock);
        } else {
          await disableFork();
        }
        // Stabilize base fee to avoid EIP-1559 underpricing during deployments
        try {
          await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x0"]);
        } catch { }

        // Get signers
        const [deployer, creator, subscriber1, subscriber2, subscriber3, subscriber4, protocolAdmin, feeCollector] =
          await ethers.getSigners();

        // Deploy or configure inSupply token
        let inSupplyToken: any;
        let inSupplyTokenAddress: string;

        if (self.inSupplyTokenAddress === ethers.ZeroAddress) {
          // Native token
          inSupplyTokenAddress = ethers.ZeroAddress;
          inSupplyToken = null;
        } else {
          // ERC20 token
          const InSupplyToken = await ethers.getContractFactory("ERC20Mock");
          inSupplyToken = await InSupplyToken.deploy("StreamInSupply Token", "IN");
          inSupplyTokenAddress = self.inSupplyTokenAddress ?? await inSupplyToken.getAddress();
        }

        // Deploy outSupply token (always ERC20)
        const OutSupplyToken = await ethers.getContractFactory("ERC20Mock");
        const outSupplyToken = await OutSupplyToken.deploy("StreamOutSupply Token", "OUT");
        const outSupplyTokenAddress = self.outSupplyTokenAddress ?? await outSupplyToken.getAddress();

        // Deploy fee token (always ERC20)
        const FeeToken = await ethers.getContractFactory("ERC20Mock");
        const feeToken = await FeeToken.deploy("Fee Token", "FEE");
        const feeTokenAddress = self.feeTokenAddress ?? await feeToken.getAddress();

        // Deploy Permit2 at the hardcoded address
        const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

        // Read Permit2 bytecode from file
        const permit2BytecodePath = path.join(__dirname, "../../../../permit2_bytecode.txt");
        const permit2Bytecode = fs.readFileSync(permit2BytecodePath, "utf8").trim();

        // Deploy Permit2 at the hardcoded address using setCode
        await ethers.provider.send("hardhat_setCode", [PERMIT2_ADDRESS, permit2Bytecode]);

        // Optionally deploy pool wrappers on fork
        let v2PoolWrapperAddress: string = ethers.ZeroAddress;
        let v3PoolWrapperAddress: string = ethers.ZeroAddress;
        let aerodromePoolWrapperAddress: string = ethers.ZeroAddress;
        if (self.enablePoolCreationFlag) {
          const { wrapperAddress: v2Addr } = await deployV2PoolWrapperFork();
          const { wrapperAddress: v3Addr } = await deployV3PoolWrapperFork(3000);
          v2PoolWrapperAddress = v2Addr;
          v3PoolWrapperAddress = v3Addr;
          // For now, don't deploy Aerodrome wrapper in tests since it's not available on mainnet fork
          aerodromePoolWrapperAddress = ethers.ZeroAddress;
        }

        // Deploy StreamFactory
        const StreamFactoryFactory = await ethers.getContractFactory("StreamFactory");
        const streamFactory = await StreamFactoryFactory.deploy(protocolAdmin.address);
        const streamFactoryAddress = await streamFactory.getAddress();

        // Deploy Stream Implementation
        const StreamImplementationFactory = await ethers.getContractFactory("Stream");
        const streamImplementation = await StreamImplementationFactory.deploy(streamFactoryAddress);
        const streamImplementationAddress = await streamImplementation.getAddress();

        // Deploy TokenFactory
        const TokenFactoryFactory = await ethers.getContractFactory("TokenFactory");
        const tokenFactory = await TokenFactoryFactory.deploy();
        const tokenFactoryAddress = await tokenFactory.getAddress();

        // Initialize Stream Factory (provide wrapper addresses only when pool creation enabled)
        const streamFactoryMessage: StreamFactoryTypes.InitializeStreamFactoryMessageStruct = {
          streamCreationFee: self.factoryConfig.streamCreationFee,
          streamCreationFeeToken: feeTokenAddress,
          exitFeeRatio: self.factoryConfig.exitFeeRatio,
          minWaitingDuration: self.factoryConfig.minWaitingDuration,
          minBootstrappingDuration: self.factoryConfig.minBootstrappingDuration,
          minStreamDuration: self.factoryConfig.minStreamDuration,
          feeCollector: feeCollector.address,
          protocolAdmin: protocolAdmin.address,
          tosVersion: self.metadataConfig.tosVersion,
          acceptedInSupplyTokens: [inSupplyTokenAddress, ethers.ZeroAddress],
          streamImplementationAddress: streamImplementationAddress,
          tokenFactoryAddress: tokenFactoryAddress,
          V2PoolWrapperAddress: v2PoolWrapperAddress,
          V3PoolWrapperAddress: v3PoolWrapperAddress,
          AerodromePoolWrapperAddress: aerodromePoolWrapperAddress,
        };

        await streamFactory.connect(protocolAdmin).initialize(streamFactoryMessage);

        // Get factory params
        const factoryParams = await streamFactory.getParams();
        const streamCreationFee = factoryParams.streamCreationFee;

        // Mint tokens
        await feeToken.mint(creator.address, ethers.parseEther("1000000000"));
        await outSupplyToken.mint(creator.address, self.amountConfig.streamOutAmount);

        // Mint inSupply tokens only if using ERC20
        if (inSupplyToken) {
          await inSupplyToken.mint(subscriber1.address, ethers.parseEther("1000000000"));
          await inSupplyToken.mint(subscriber2.address, ethers.parseEther("1000000000"));
          await inSupplyToken.mint(subscriber3.address, ethers.parseEther("1000000000"));
          await inSupplyToken.mint(subscriber4.address, ethers.parseEther("1000000000"));
        }

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
              poolOutSupplyAmount: self.enablePoolCreationFlag ? self.poolConfig.poolOutSupplyAmount : 0n,
              dexType: self.selectedDexType,
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

        // Get Permit2 contract instance
        const permit2 = await ethers.getContractAt("IPermit2", PERMIT2_ADDRESS);

        return {
          contracts: {
            stream,
            streamFactory,
            inSupplyToken,
            outSupplyToken,
            // Return wrappers only if created
            v2PoolWrapper: v2PoolWrapperAddress !== ethers.ZeroAddress
              ? await ethers.getContractAt("PoolWrapper", v2PoolWrapperAddress)
              : undefined,
            v3PoolWrapper: v3PoolWrapperAddress !== ethers.ZeroAddress
              ? await ethers.getContractAt("PoolWrapper", v3PoolWrapperAddress)
              : undefined,
            aerodromePoolWrapper: aerodromePoolWrapperAddress !== ethers.ZeroAddress
              ? await ethers.getContractAt("PoolWrapper", aerodromePoolWrapperAddress)
              : undefined,
            permit2,
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
            tokenConfig: {
              inSupplyTokenType: inSupplyToken ? "erc20" : "native",
              inSupplyTokenAddress: inSupplyTokenAddress,
              outSupplyTokenAddress: outSupplyTokenAddress,
              feeTokenAddress: feeTokenAddress,
              isNativeToken: !inSupplyToken,
            },
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
          uniswapV2Factory: undefined as any,
          uniswapV2Router: undefined as any,
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
