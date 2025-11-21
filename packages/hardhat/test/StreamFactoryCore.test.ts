import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";
import { StreamFactory, StreamFactoryTypes } from "../typechain-types/src/StreamFactory";
import { ERC20Mock } from "../typechain-types";
import { StreamBasic } from "../typechain-types/src/StreamBasic";
import { StreamPostActions } from "../typechain-types/src/StreamPostActions";
import { TokenFactory } from "../typechain-types/src/TokenFactory";
import { VestingFactory } from "../typechain-types/src/VestingFactory";
import { PoolRouter } from "../typechain-types/src/PoolRouter";

describe("StreamFactoryCore", function () {
    const defaultFixture = streamFactory().build();
    describe("Constructor", function () {
        it("should set the protocol admin correctly", async function () {
            const fixture = await loadFixture(defaultFixture);
            const params = await fixture.contracts.streamFactory.getParams();
            expect(params.protocolAdmin).to.equal(fixture.accounts.protocolAdmin.address);
        });

        it("should revert if protocol admin is zero address", async function () {
            const StreamFactoryContract = await ethers.getContractFactory("StreamFactory");
            await expect(StreamFactoryContract.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                StreamFactoryContract,
                "InvalidProtocolAdmin",
            );
        });
    });

    describe("Initialization", function () {
        let protocolAdmin: HardhatEthersSigner;
        let feeCollector: HardhatEthersSigner;
        let validInitMessage: StreamFactoryTypes.InitializeStreamFactoryMessageStruct;
        let streamFactory: StreamFactory;
        let mockToken: ERC20Mock;
        let streamBasic: StreamBasic;
        let streamPostActions: StreamPostActions;
        let v2WrapperAddress: string;
        let v3WrapperAddress: string;
        let aerodromeWrapperAddress: string;
        let poolRouterAddress: string;
        let tokenFactory: TokenFactory;
        let vestingFactory: VestingFactory;

        beforeEach(async function () {
            const signers = await ethers.getSigners();
            protocolAdmin = signers[0];
            feeCollector = signers[1];

            // Deploy mock contracts for testing
            const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
            mockToken = await ERC20Mock.deploy("Mock Token", "MOCK");
            await mockToken.waitForDeployment();

            // No pool router by default
            v2WrapperAddress = ethers.ZeroAddress;
            v3WrapperAddress = ethers.ZeroAddress;
            aerodromeWrapperAddress = ethers.ZeroAddress;
            poolRouterAddress = ethers.ZeroAddress;

            // Deploy fresh factory for each test
            const StreamFactoryContract = await ethers.getContractFactory("StreamFactory");
            streamFactory = await StreamFactoryContract.deploy(protocolAdmin.address) as StreamFactory;
            await streamFactory.waitForDeployment();

            // Deploy stream implementations (all 4 variants)
            const StreamBasicFactory = await ethers.getContractFactory("StreamBasic");
            const StreamPostActionsFactory = await ethers.getContractFactory("StreamPostActions");

            streamBasic = await StreamBasicFactory.deploy() as StreamBasic;
            streamPostActions = await StreamPostActionsFactory.deploy() as StreamPostActions;

            await Promise.all([
                streamBasic.waitForDeployment(),
                streamPostActions.waitForDeployment(),
            ]);

            // Deploy TokenFactory
            const TokenFactoryContract = await ethers.getContractFactory("TokenFactory");
            tokenFactory = await TokenFactoryContract.deploy() as TokenFactory;
            await tokenFactory.waitForDeployment();

            // Deploy VestingFactory
            const VestingFactoryContract = await ethers.getContractFactory("VestingFactory");
            vestingFactory = await VestingFactoryContract.deploy() as VestingFactory;
            await vestingFactory.waitForDeployment();

            // Deploy a PoolRouter for default init
            const PoolRouterContract = await ethers.getContractFactory("PoolRouter");
            const poolRouter = await PoolRouterContract.deploy() as PoolRouter;
            await poolRouter.waitForDeployment();
            poolRouterAddress = await poolRouter.getAddress();

            // Valid init message template
            validInitMessage = {
                streamCreationFee: 100,
                streamCreationFeeToken: await mockToken.getAddress(),
                exitFeeRatio: { value: 100000n },
                minWaitingDuration: 3600,
                minBootstrappingDuration: 3600,
                minStreamDuration: 3600,
                feeCollector: feeCollector.address,
                protocolAdmin: protocolAdmin.address,
                tosVersion: "1.0",
                acceptedInSupplyTokens: [await mockToken.getAddress()],
                basicImplementationAddress: await streamBasic.getAddress(),
                postActionsImplementationAddress: await streamPostActions.getAddress(),
                poolRouterAddress: poolRouterAddress,
                tokenFactoryAddress: await tokenFactory.getAddress(),
                vestingFactoryAddress: await vestingFactory.getAddress(),
            };
        });

        it("should prevent double initialization", async function () {
            // Initialize once
            await streamFactory.connect(protocolAdmin).initialize(validInitMessage);

            // Try to initialize again - should fail
            await expect(streamFactory.connect(protocolAdmin).initialize(validInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "AlreadyInitialized",
            );
        });

        it("should only allow admin to initialize", async function () {
            const [, , nonAdmin] = await ethers.getSigners();

            await expect(streamFactory.connect(nonAdmin).initialize(validInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "NotAdmin",
            );
        });

        it("should revert if exit fee ratio is greater than 100%", async function () {
            const invalidInitMessage = {
                ...validInitMessage,
                exitFeeRatio: { value: 1500000n }, // 150%
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(invalidInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "InvalidExitFeeRatio",
            );
        });

        it("should revert if accepted tokens array is empty", async function () {
            const invalidInitMessage = {
                ...validInitMessage,
                acceptedInSupplyTokens: [],
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(invalidInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "InvalidAcceptedInSupplyTokens",
            );
        });

        it("should allow zero address as stream creation fee token for native token support", async function () {
            const nativeTokenInitMessage = {
                ...validInitMessage,
                streamCreationFeeToken: ethers.ZeroAddress,
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(nativeTokenInitMessage)).to.not.be.reverted;
        });

        it("should allow zero address for implementation addresses to disable stream types", async function () {
            const zeroImplInitMessage = {
                ...validInitMessage,
                basicImplementationAddress: ethers.ZeroAddress,
            };

            // Should not revert - zero addresses are allowed to disable stream types
            await expect(streamFactory.connect(protocolAdmin).initialize(zeroImplInitMessage)).to.not.be.reverted;
        });

        it("should allow zero address for pool router", async function () {
            const zeroWrappers = {
                ...validInitMessage,
                poolRouterAddress: ethers.ZeroAddress,
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(zeroWrappers)).to.not.be.reverted;
        });

        it("should allow zero address in accepted tokens for native token support", async function () {
            const nativeTokenInitMessage = {
                ...validInitMessage,
                acceptedInSupplyTokens: [await mockToken.getAddress(), ethers.ZeroAddress],
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(nativeTokenInitMessage)).to.not.be.reverted;
        });

        it("should allow zero address for vesting factory to disable vesting", async function () {
            const noVestingInitMessage = {
                ...validInitMessage,
                vestingFactoryAddress: ethers.ZeroAddress,
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(noVestingInitMessage)).to.not.be.reverted;
        });

        it("should emit FactoryInitialized event on successful initialization", async function () {
            const tx = await streamFactory.connect(protocolAdmin).initialize(validInitMessage);
            const receipt = await tx.wait();
            if (!receipt) throw new Error("Transaction receipt is null");

            // Find the FactoryInitialized event
            const factoryInitializedEvent = receipt.logs.find((log) => {
                try {
                    const parsed = streamFactory.interface.parseLog(log);
                    return parsed?.name === "FactoryInitialized";
                } catch {
                    return false;
                }
            });

            expect(factoryInitializedEvent).to.not.be.undefined;
            if (!factoryInitializedEvent) throw new Error("FactoryInitialized event not found");

            // Parse the event to verify the parameters
            const parsedEvent = streamFactory.interface.parseLog(factoryInitializedEvent);
            if (!parsedEvent) throw new Error("Failed to parse event");
            expect(parsedEvent.args[0]).to.equal(await streamFactory.getAddress()); // factory
            expect(parsedEvent.args[1]).to.equal(validInitMessage.basicImplementationAddress);
            expect(parsedEvent.args[2]).to.equal(validInitMessage.postActionsImplementationAddress);
            expect(parsedEvent.args[3]).to.equal(validInitMessage.poolRouterAddress);
            expect(parsedEvent.args[4]).to.equal(validInitMessage.feeCollector);
            expect(parsedEvent.args[5]).to.equal(validInitMessage.protocolAdmin);
            expect(parsedEvent.args[6]).to.equal(validInitMessage.streamCreationFeeToken);
            expect(parsedEvent.args[7]).to.deep.equal(validInitMessage.acceptedInSupplyTokens);
            expect(parsedEvent.args[8]).to.equal(validInitMessage.streamCreationFee);
            expect(parsedEvent.args[9]).to.equal(validInitMessage.exitFeeRatio.value);
            expect(parsedEvent.args[10]).to.equal(validInitMessage.minWaitingDuration);
            expect(parsedEvent.args[11]).to.equal(validInitMessage.minBootstrappingDuration);
            expect(parsedEvent.args[12]).to.equal(validInitMessage.minStreamDuration);
            expect(parsedEvent.args[13]).to.equal(validInitMessage.tosVersion);
            expect(parsedEvent.args[14]).to.equal(validInitMessage.vestingFactoryAddress);
        });

        it("should correctly set all parameters after initialization", async function () {
            await streamFactory.connect(protocolAdmin).initialize(validInitMessage);

            const params = await streamFactory.getParams();
            expect(params.streamCreationFee).to.equal(validInitMessage.streamCreationFee);
            expect(params.streamCreationFeeToken).to.equal(validInitMessage.streamCreationFeeToken);
            expect(params.exitFeeRatio.value).to.equal(validInitMessage.exitFeeRatio.value);
            expect(params.minWaitingDuration).to.equal(validInitMessage.minWaitingDuration);
            expect(params.minBootstrappingDuration).to.equal(validInitMessage.minBootstrappingDuration);
            expect(params.minStreamDuration).to.equal(validInitMessage.minStreamDuration);
            expect(params.feeCollector).to.equal(validInitMessage.feeCollector);
            expect(params.protocolAdmin).to.equal(validInitMessage.protocolAdmin);
            expect(params.tosVersion).to.equal(validInitMessage.tosVersion);
            // Check implementations using getImplementation
            expect(await streamFactory.getImplementation(0)).to.equal(validInitMessage.basicImplementationAddress); // Basic
            expect(await streamFactory.getImplementation(1)).to.equal(validInitMessage.postActionsImplementationAddress); // PostActions
            expect(params.poolRouterAddress).to.equal(validInitMessage.poolRouterAddress);
            expect(params.vestingFactoryAddress).to.equal(validInitMessage.vestingFactoryAddress);

            // Check accepted tokens are set correctly
            for (const token of validInitMessage.acceptedInSupplyTokens) {
                expect(await streamFactory.isAcceptedInSupplyToken(token)).to.be.true;
            }
        });
    });

    describe("View Functions", function () {
        it("should return correct stream addresses", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const streams = await fixture.contracts.streamFactory.getStreams();
            expect(streams).to.be.an("array");
        });

        it("should return correct parameters", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const params = await fixture.contracts.streamFactory.getParams();

            expect(params.streamCreationFee).to.not.be.undefined;
            expect(params.exitFeeRatio).to.not.be.undefined;
            expect(params.minWaitingDuration).to.not.be.undefined;
            expect(params.minBootstrappingDuration).to.not.be.undefined;
            expect(params.minStreamDuration).to.not.be.undefined;
            expect(params.feeCollector).to.not.be.undefined;
            expect(params.protocolAdmin).to.not.be.undefined;
            expect(params.tosVersion).to.not.be.undefined;
        });

        it("should return correct stream by ID", async function () {
            const fixture = await loadFixture(streamFactory().build());
            // Check current stream count first - if no streams exist, address should be zero
            const currentStreamId = await fixture.contracts.streamFactory.currentStreamId();

            if (currentStreamId > 0) {
                const streamAddress = await fixture.contracts.streamFactory.getStream(0);
                expect(streamAddress).to.not.equal(ethers.ZeroAddress);
            } else {
                // If no streams exist, getting stream 0 should return zero address
                const streamAddress = await fixture.contracts.streamFactory.getStream(0);
                expect(streamAddress).to.equal(ethers.ZeroAddress);
            }
        });

        it("should correctly identify if address is a stream", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const randomAddress = ethers.Wallet.createRandom().address;

            expect(await fixture.contracts.streamFactory.isStream(randomAddress)).to.be.false;
            // Note: Testing with actual stream address would require creating a stream first
        });

        it("should return accepted tokens list", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const acceptedTokens = await fixture.contracts.streamFactory.getAcceptedInSupplyTokens();
            expect(acceptedTokens).to.be.an("array");
        });
    });

    describe("Access Control", function () {
        it("should enforce admin-only access across all admin functions", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const nonAdmin = fixture.accounts.creator;
            const dummyAddress = ethers.Wallet.createRandom().address;

            // Test all admin functions
            const adminFunctions = [
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateStreamFeeParameters(100, dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateExitFeeRatio({ value: 100000n }),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateTimingParameters(3600, 3600, 3600),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateTosVersion("2.0"),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateFeeCollector(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateProtocolAdmin(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updatePoolRouterAddress(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateVestingFactoryAddress(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateImplementationParameters(dummyAddress, dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateAcceptedTokens([dummyAddress], []),
                () => fixture.contracts.streamFactory.connect(nonAdmin).setFrozen(true),
            ];

            for (const func of adminFunctions) {
                await expect(func()).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            }
        });
    });

    describe("Edge Cases", function () {
        it("should update vesting factory address and emit event", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const protocolAdmin = fixture.accounts.protocolAdmin;
            const newVestingFactory = ethers.Wallet.createRandom().address;
            const factoryAddress = await fixture.contracts.streamFactory.getAddress();
            const paramsBefore = await fixture.contracts.streamFactory.getParams();

            await expect(
                fixture.contracts.streamFactory.connect(protocolAdmin).updateVestingFactoryAddress(newVestingFactory)
            )
                .to.emit(fixture.contracts.streamFactory, "VestingFactoryUpdated")
                .withArgs(factoryAddress, paramsBefore.vestingFactoryAddress, newVestingFactory);

            const paramsAfter = await fixture.contracts.streamFactory.getParams();
            expect(paramsAfter.vestingFactoryAddress).to.equal(newVestingFactory);
        });

        it("should handle empty arrays in updateAcceptedTokens", async function () {
            const fixture = await loadFixture(streamFactory().build());

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateAcceptedTokens([], []))
                .to.emit(fixture.contracts.streamFactory, "AcceptedTokensUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), [], []);
        });
    });
}); 