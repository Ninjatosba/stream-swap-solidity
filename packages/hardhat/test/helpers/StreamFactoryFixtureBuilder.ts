// packages/hardhat/test/helpers/StreamFactoryFixtureBuilder.ts
import { ethers } from "hardhat";
import { ERC20Mock, PoolWrapper, PoolRouter } from "../../typechain-types";
import { DecimalStruct } from "../../typechain-types/src/StreamCore";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { disableFork, enableMainnetFork } from "./fork";
import { deployV2PoolWrapperFork, deployV3PoolWrapperFork } from "./poolWrappers";
import { StreamFactoryTypes } from "../../typechain-types/src/StreamFactory";

export interface StreamFactoryFixture {
  contracts: {
    streamFactory: any;
    implementations: {
      basic: string;
      withVesting: string;
      withPool: string;
      full: string;
    };
    inSupplyToken: ERC20Mock;
    outSupplyToken: ERC20Mock;
    feeToken: ERC20Mock;
    v2PoolWrapper?: PoolWrapper;
    v3PoolWrapper?: PoolWrapper;
    aerodromePoolWrapper?: PoolWrapper;
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
  private enablePoolCreationFlag: boolean = false;
  private forkBlock?: number;

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

  // Enable pool creation on fork (deploy real wrappers)
  public enablePoolCreation(enabled: boolean): StreamFactoryFixtureBuilder {
    this.enablePoolCreationFlag = enabled;
    return this;
  }

  // Optionally pin fork block
  public forkAt(blockNumber?: number): StreamFactoryFixtureBuilder {
    this.forkBlock = blockNumber;
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
    const self = this;

    // Return the fixture function
    return async function deployFactoryFixture(): Promise<StreamFactoryFixture> {
      const [creator, feeCollector, protocolAdmin] = await ethers.getSigners();

      try {
        // Only enable fork if pool creation is requested
        if (self.enablePoolCreationFlag) {
          await enableMainnetFork(self.forkBlock);
        }
        else {
          await disableFork();
        }
        // Stabilize base fee to avoid EIP-1559 underpricing during deployments
        try {
          await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x0"]);
        } catch { }

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

        // Optionally deploy pool wrappers on fork
        let v2WrapperAddress = ethers.ZeroAddress;
        let v3WrapperAddress = ethers.ZeroAddress;
        let aerodromeWrapperAddress = ethers.ZeroAddress;
        let v2PoolWrapper: PoolWrapper | undefined = undefined;
        let v3PoolWrapper: PoolWrapper | undefined = undefined;
        let aerodromePoolWrapper: PoolWrapper | undefined = undefined;
        let poolRouterAddress: string = ethers.ZeroAddress;
        if (self.enablePoolCreationFlag) {
          const v2 = await deployV2PoolWrapperFork();
          const v3 = await deployV3PoolWrapperFork(3000);
          v2WrapperAddress = v2.wrapperAddress;
          v3WrapperAddress = v3.wrapperAddress;
          v2PoolWrapper = await ethers.getContractAt("PoolWrapper", v2WrapperAddress) as unknown as PoolWrapper;
          v3PoolWrapper = await ethers.getContractAt("PoolWrapper", v3WrapperAddress) as unknown as PoolWrapper;
          aerodromeWrapperAddress = ethers.ZeroAddress;

          // Deploy PoolRouter and register wrappers
          const PoolRouterFactory = await ethers.getContractFactory("PoolRouter");
          const poolRouter = (await PoolRouterFactory.deploy()) as unknown as PoolRouter;
          await poolRouter.waitForDeployment();
          poolRouterAddress = await (poolRouter as any).getAddress();
          // DexType: 0 -> V2, 1 -> V3
          await (poolRouter as any).setWrapper(0, 0, v2WrapperAddress);
          await (poolRouter as any).setWrapper(1, 3000, v3WrapperAddress);
        }


        // Deploy StreamFactory
        const StreamFactoryFactory = await ethers.getContractFactory("StreamFactory");
        const streamFactory = await StreamFactoryFactory.deploy(protocolAdmin.address);
        await streamFactory.waitForDeployment();

        // Deploy TokenFactory
        const TokenFactoryFactory = await ethers.getContractFactory("TokenFactory");
        const tokenFactory = await TokenFactoryFactory.deploy();
        await tokenFactory.waitForDeployment();

        // Deploy VestingFactory
        const VestingFactoryFactory = await ethers.getContractFactory("VestingFactory");
        const vestingFactory = await VestingFactoryFactory.deploy();
        await vestingFactory.waitForDeployment();

        // Deploy Stream Implementations (variants)
        const StreamBasicFactory = await ethers.getContractFactory("StreamBasic");
        const StreamPostActionsFactory = await ethers.getContractFactory("StreamPostActions");

        const streamBasic = await StreamBasicFactory.deploy();
        const streamPostActions = await StreamPostActionsFactory.deploy();

        await Promise.all([
          streamBasic.waitForDeployment(),
          streamPostActions.waitForDeployment(),
        ]);

        // Initialize the factory
        const initMessage: StreamFactoryTypes.InitializeStreamFactoryMessageStruct = {
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
          basicImplementationAddress: await streamBasic.getAddress(),
          postActionsImplementationAddress: await streamPostActions.getAddress(),
          tokenFactoryAddress: await tokenFactory.getAddress(),
          poolRouterAddress: poolRouterAddress,
          vestingFactoryAddress: await vestingFactory.getAddress(),
        };

        // Initialize with proper error handling
        const tx = await (streamFactory as any).connect(protocolAdmin).initialize(initMessage);
        await tx.wait();

        // Implementations set during initialize

        return {
          contracts: {
            streamFactory,
            implementations: {
              basic: await streamBasic.getAddress(),
              withVesting: await streamPostActions.getAddress(),
              withPool: await streamPostActions.getAddress(),
              full: await streamPostActions.getAddress(),
            },
            inSupplyToken,
            outSupplyToken,
            feeToken,
            v2PoolWrapper,
            v3PoolWrapper,
            aerodromePoolWrapper,
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
