import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("StreamFactoryCore", function () {
    describe("Constructor", function () {
        it("should set the protocol admin correctly", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const params = await fixture.contracts.streamFactory.getParams();
            expect(params.protocolAdmin).to.equal(fixture.accounts.protocolAdmin.address);
        });

        it("should revert if protocol admin is zero address", async function () {
            const StreamFactory = await ethers.getContractFactory("StreamFactory");
            await expect(StreamFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                StreamFactory,
                "InvalidProtocolAdmin",
            );
        });
    });

    describe("Initialization", function () {
        let protocolAdmin: any;
        let feeCollector: any;
        let validInitMessage: any;
        let streamFactory: any;
        let mockToken: any;
        let streamImplementation: any;
        let poolWrapper: any;

        beforeEach(async function () {
            const signers = await ethers.getSigners();
            protocolAdmin = signers[0];
            feeCollector = signers[1];

            // Deploy mock contracts for testing
            const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
            mockToken = await ERC20Mock.deploy("Mock Token", "MOCK");
            await mockToken.waitForDeployment();

            // Deploy mock Uniswap contracts
            const MockUniswapV2Factory = await ethers.getContractFactory("MockUniswapV2Factory");
            const mockUniswapV2Factory = await MockUniswapV2Factory.deploy();
            await mockUniswapV2Factory.waitForDeployment();

            const MockUniswapV2Router = await ethers.getContractFactory("MockUniswapV2Router02");
            const mockUniswapV2Router = await MockUniswapV2Router.deploy(await mockUniswapV2Factory.getAddress());
            await mockUniswapV2Router.waitForDeployment();

            const PoolWrapper = await ethers.getContractFactory("PoolWrapper");
            poolWrapper = await PoolWrapper.deploy(await mockUniswapV2Factory.getAddress(), await mockUniswapV2Router.getAddress());
            await poolWrapper.waitForDeployment();

            // Deploy fresh factory for each test
            const StreamFactory = await ethers.getContractFactory("StreamFactory");
            streamFactory = await StreamFactory.deploy(protocolAdmin.address);
            await streamFactory.waitForDeployment();

            // Deploy stream implementation
            const Stream = await ethers.getContractFactory("Stream");
            streamImplementation = await Stream.deploy(await streamFactory.getAddress());
            await streamImplementation.waitForDeployment();

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
                streamImplementationAddress: await streamImplementation.getAddress(),
                poolWrapperAddress: await poolWrapper.getAddress(),
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

        it("should revert if stream creation fee token is zero address", async function () {
            const invalidInitMessage = {
                ...validInitMessage,
                streamCreationFeeToken: ethers.ZeroAddress,
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(invalidInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "InvalidStreamCreationFeeToken",
            );
        });

        it("should revert if stream implementation address is zero address", async function () {
            const invalidInitMessage = {
                ...validInitMessage,
                streamImplementationAddress: ethers.ZeroAddress,
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(invalidInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "InvalidStreamImplementationAddress",
            );
        });

        it("should revert if pool wrapper address is zero address", async function () {
            const invalidInitMessage = {
                ...validInitMessage,
                poolWrapperAddress: ethers.ZeroAddress,
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(invalidInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "InvalidPoolWrapper",
            );
        });

        it("should revert if accepted tokens contain zero address", async function () {
            const invalidInitMessage = {
                ...validInitMessage,
                acceptedInSupplyTokens: [await mockToken.getAddress(), ethers.ZeroAddress],
            };

            await expect(streamFactory.connect(protocolAdmin).initialize(invalidInitMessage)).to.be.revertedWithCustomError(
                streamFactory,
                "InvalidAcceptedInSupplyTokens",
            );
        });

        it("should emit FactoryInitialized event on successful initialization", async function () {
            const tx = await streamFactory.connect(protocolAdmin).initialize(validInitMessage);
            const receipt = await tx.wait();

            // Find the FactoryInitialized event
            const factoryInitializedEvent = receipt.logs.find((log: any) => {
                try {
                    const parsed = streamFactory.interface.parseLog(log);
                    return parsed?.name === "FactoryInitialized";
                } catch {
                    return false;
                }
            });

            expect(factoryInitializedEvent).to.not.be.undefined;

            // Parse the event to verify the parameters
            const parsedEvent = streamFactory.interface.parseLog(factoryInitializedEvent);
            expect(parsedEvent.args[0]).to.equal(await streamFactory.getAddress()); // factory
            expect(parsedEvent.args[1]).to.equal(validInitMessage.streamImplementationAddress);
            expect(parsedEvent.args[2]).to.equal(validInitMessage.poolWrapperAddress);
            expect(parsedEvent.args[3]).to.equal(validInitMessage.feeCollector);
            expect(parsedEvent.args[4]).to.equal(validInitMessage.protocolAdmin);
            expect(parsedEvent.args[5]).to.equal(validInitMessage.streamCreationFeeToken);
            expect(parsedEvent.args[6]).to.deep.equal(validInitMessage.acceptedInSupplyTokens);
            expect(parsedEvent.args[7]).to.equal(validInitMessage.streamCreationFee);
            expect(parsedEvent.args[8]).to.equal(validInitMessage.exitFeeRatio.value);
            expect(parsedEvent.args[9]).to.equal(validInitMessage.minWaitingDuration);
            expect(parsedEvent.args[10]).to.equal(validInitMessage.minBootstrappingDuration);
            expect(parsedEvent.args[11]).to.equal(validInitMessage.minStreamDuration);
            expect(parsedEvent.args[12]).to.equal(validInitMessage.tosVersion);
            expect(parsedEvent.args[13]).to.not.equal(ethers.ZeroAddress); // vestingAddress should be set
        });

        it("should emit VestingContractDeployed event on successful initialization", async function () {
            await expect(streamFactory.connect(protocolAdmin).initialize(validInitMessage)).to.emit(
                streamFactory,
                "VestingContractDeployed",
            );
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
            expect(params.streamImplementationAddress).to.equal(validInitMessage.streamImplementationAddress);
            expect(params.poolWrapperAddress).to.equal(validInitMessage.poolWrapperAddress);
            expect(params.vestingFactoryAddress).to.not.equal(ethers.ZeroAddress);

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
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateStreamCreationFee(100),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateStreamCreationFeeToken(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateExitFeeRatio({ value: 100000n }),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateMinWaitingDuration(3600),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateMinBootstrappingDuration(3600),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateMinStreamDuration(3600),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateTosVersion("2.0"),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateFeeCollector(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateProtocolAdmin(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updatePoolWrapper(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateStreamImplementation(dummyAddress),
                () => fixture.contracts.streamFactory.connect(nonAdmin).updateAcceptedTokens([dummyAddress], []),
                () => fixture.contracts.streamFactory.connect(nonAdmin).setFrozen(true),
            ];

            for (const func of adminFunctions) {
                await expect(func()).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            }
        });
    });

    describe("Edge Cases", function () {
        it("should handle empty arrays in updateAcceptedTokens", async function () {
            const fixture = await loadFixture(streamFactory().build());

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateAcceptedTokens([], []))
                .to.emit(fixture.contracts.streamFactory, "AcceptedTokensUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), [], []);
        });
    });
}); 