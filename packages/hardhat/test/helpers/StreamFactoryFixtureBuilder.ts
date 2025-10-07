// packages/hardhat/test/helpers/StreamFactoryFixtureBuilder.ts
import { ethers } from "hardhat";
import { StreamFactory, ERC20Mock, Stream, PoolWrapper, MockUniswapV2Factory, MockUniswapV2Router02 } from "../../typechain-types";
import { DecimalStruct } from "../../typechain-types/src/Stream";
import { StreamFactoryTypes } from "../../typechain-types/src/StreamFactory";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface StreamFactoryFixture {
  contracts: {
    streamFactory: StreamFactory;
    streamImplementation: Stream;
    inSupplyToken: ERC20Mock;
    outSupplyToken: ERC20Mock;
    feeToken: ERC20Mock;
    poolWrapper: PoolWrapper;
    uniswapV2Factory: MockUniswapV2Factory;
    uniswapV2Router: MockUniswapV2Router02;
  };
  accounts: {
    creator: HardhatEthersSigner;
    feeCollector: HardhatEthersSigner;
    protocolAdmin: HardhatEthersSigner;
  };
  config: {
    streamCreationFee: bigint;
    ExitFeeRatio: DecimalStruct;
    minWaitingDuration: number;
    minBootstrappingDuration: number;
    minStreamDuration: number;
    tosVersion: string;
  };
}

export class StreamFactoryFixtureBuilder {
  private streamCreationFee: bigint = 0n;
  private ExitFeeRatio: DecimalStruct = {
    value: 100n, // 1% (scaled by 10000)
  };
  private minWaitingDuration: number = 1; // 1 second
  private minBootstrappingDuration: number = 1; // 1 second
  private minStreamDuration: number = 1; // 1 second
  private tosVersion: string = "1.0";
  private initialTokenSupply: bigint = ethers.parseEther("100000");
  private useNativeTokenFee: boolean = false;
  private useNativeInputToken: boolean = false;

  // Method to set stream creation fee
  public fee(amount: bigint): StreamFactoryFixtureBuilder {
    if (amount < 0) throw new Error("Fee cannot be negative");
    this.streamCreationFee = amount;
    return this;
  }

  // Method to set exit fee percent
  public exitPercent(percent: number): StreamFactoryFixtureBuilder {
    if (percent < 0 || percent > 100) throw new Error("Exit percent must be between 0 and 100");
    this.ExitFeeRatio = {
      value: BigInt(percent * 1e5),
    };
    return this;
  }

  // Method to set minimum durations
  public minDurations(waiting: number, bootstrapping: number, stream: number): StreamFactoryFixtureBuilder {
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

  // Method to use native token as fee token
  public nativeFee(): StreamFactoryFixtureBuilder {
    this.useNativeTokenFee = true;
    return this;
  }

  // Method to use native token as input supply token
  public nativeInput(): StreamFactoryFixtureBuilder {
    this.useNativeInputToken = true;
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
      tosVersion: this.tosVersion,
    };

    const useNativeTokenFee = this.useNativeTokenFee;
    const useNativeInputToken = this.useNativeInputToken;

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

        const FeeToken = await ethers.getContractFactory("ERC20Mock");
        const feeToken = await FeeToken.deploy("Fee Token", "FEE");
        await feeToken.waitForDeployment();

        // Mint tokens to the creator
        await inSupplyToken.mint(creator.address, initialSupply);
        await outSupplyToken.mint(creator.address, initialSupply);
        await feeToken.mint(creator.address, ethers.parseEther("1000000000"));

        // Deploy Uniswap V2 mock contracts
        const UniswapV2FactoryFactory = await ethers.getContractFactory("MockUniswapV2Factory");
        const uniswapV2Factory = await UniswapV2FactoryFactory.deploy();
        await uniswapV2Factory.waitForDeployment();

        const UniswapV2RouterFactory = await ethers.getContractFactory("MockUniswapV2Router02");
        const uniswapV2Router = await UniswapV2RouterFactory.deploy(
          await uniswapV2Factory.getAddress(),
        );
        await uniswapV2Router.waitForDeployment();

        // Deploy pool wrapper contract (unified V2 wrapper)
        const PoolWrapperFactory = await ethers.getContractFactory("V2PoolWrapper");
        const poolWrapper = await PoolWrapperFactory.deploy(
          await uniswapV2Factory.getAddress(),
          await uniswapV2Router.getAddress(),
        );
        await poolWrapper.waitForDeployment();

        // Deploy StreamFactory
        const StreamFactoryFactory = await ethers.getContractFactory("StreamFactory");
        const streamFactory = await StreamFactoryFactory.deploy(protocolAdmin.address);
        await streamFactory.waitForDeployment();

        // Deploy TokenFactory
        const TokenFactoryFactory = await ethers.getContractFactory("TokenFactory");
        const tokenFactory = await TokenFactoryFactory.deploy();
        await tokenFactory.waitForDeployment();

        // Deploy Stream Implementation
        const StreamImplementationFactory = await ethers.getContractFactory("Stream");
        const streamImplementation = await StreamImplementationFactory.deploy(await streamFactory.getAddress());
        await streamImplementation.waitForDeployment();

        // Initialize the factory
        const initMessage: StreamFactoryTypes.InitializeStreamMessageStruct = {
          streamCreationFee: config.streamCreationFee,
          streamCreationFeeToken: useNativeTokenFee ? ethers.ZeroAddress : await feeToken.getAddress(),
          exitFeeRatio: config.ExitFeeRatio,
          minWaitingDuration: config.minWaitingDuration,
          minBootstrappingDuration: config.minBootstrappingDuration,
          minStreamDuration: config.minStreamDuration,
          feeCollector: feeCollector.address,
          protocolAdmin: protocolAdmin.address,
          tosVersion: config.tosVersion,
          acceptedInSupplyTokens: useNativeInputToken ? [ethers.ZeroAddress] : [await inSupplyToken.getAddress()],
          poolWrapperAddress: await poolWrapper.getAddress(),
          streamImplementationAddress: await streamImplementation.getAddress(),
          tokenFactoryAddress: await tokenFactory.getAddress(),
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
            feeToken,
            poolWrapper,
            uniswapV2Factory,
            uniswapV2Router,
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
