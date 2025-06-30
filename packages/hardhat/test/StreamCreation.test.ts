import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("StreamCreation", function () {
    describe("createStream", function () {
        it("should create a stream successfully with valid parameters and zero fee", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Create a valid stream creation message
            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            // Approve tokens for the factory - need to approve more than the amount
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("2000")); // Approve more than needed

            // Create the stream
            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.emit(fixture.contracts.streamFactory, "StreamCreated");
        });

        it("should create a stream successfully with valid parameters and non-zero fee", async function () {
            const fixture = await loadFixture(streamFactory().fee(ethers.parseEther("100")).build());

            // Approve tokens for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("1000"));

            // Approve the stream creation fee token
            await fixture.contracts.feeToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("100"));

            // Create a valid stream creation message
            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: 0,
                },
                tosVersion: "1.0",
            };

            // Check creator balance
            const creatorBalanceBefore = await fixture.contracts.feeToken.balanceOf(fixture.accounts.creator.address);

            // Create the stream
            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.emit(fixture.contracts.streamFactory, "StreamCreated");

            // Check creator balance
            const creatorBalanceAfter = await fixture.contracts.feeToken.balanceOf(fixture.accounts.creator.address);
            expect(creatorBalanceAfter).to.equal(creatorBalanceBefore - ethers.parseEther("100"));
        });

        it("should prevent stream creation when factory is frozen", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // First freeze the factory
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(true);

            // Create a valid stream creation message
            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            // Attempt to create stream should fail with ContractFrozen error
            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "ContractFrozen");
        });

        it("should revert if inSupplyToken is not accepted", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Create a new token that's not in the accepted list
            const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
            const unacceptedToken = await ERC20Mock.deploy("Unaccepted Token", "UNA");
            await unacceptedToken.waitForDeployment();

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await unacceptedToken.getAddress(), // Use unaccepted token
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "StreamInputTokenNotAccepted");
        });

        it("should revert if streamOutAmount is zero", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: 0, // Zero amount
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "ZeroOutSupplyNotAllowed");
        });

        it("should revert if bootstrappingStartTime is in the past", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now - 3600, // Past time
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidBootstrappingStartTime");
        });

        it("should revert if stream timing is invalid", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 3600, // End time before start time
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidStreamEndTime");
        });

        it("should revert if TOS version is empty", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "", // Empty TOS version
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidToSVersion");
        });
        it("should revert if out supply token is not approved", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.reverted; // ERC20InsufficientAllowance error from OpenZeppelin
        });
        it("should revert if fee token is not approved", async function () {
            const fixture = await loadFixture(streamFactory().fee(ethers.parseEther("100")).build());

            // Approve out supply token for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("1000"));

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("0"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.reverted; // ERC20InsufficientAllowance error from OpenZeppelin
        });
        it("should revert if pool out supply amount is not approved", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            // Approve only stream out amount
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), createStreamMessage.streamOutAmount);

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.reverted; // ERC20InsufficientAllowance error from OpenZeppelin
        });

        it("should revert if pool out supply amount is greater than stream out amount", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("1001"),
                },
                tosVersion: "1.0",
            };

            // Approve out supply token for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), createStreamMessage.streamOutAmount + createStreamMessage.poolInfo.poolOutSupplyAmount);

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamImplementation, "InvalidPoolOutSupplyAmount");
        });

        it("should revert if creator is zero address", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: ethers.ZeroAddress, // Zero address
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidCreator");
        });

        it("should revert if out supply token is zero address", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress, // Zero address
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidOutSupplyToken");
        });

        it("should revert if creator vesting is enabled but duration is zero", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: true,
                    vestingDuration: 0, // Zero duration with vesting enabled
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidVestingDuration");
        });

        it("should revert if beneficiary vesting is enabled but duration is zero", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: true,
                    vestingDuration: 0, // Zero duration with vesting enabled
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidVestingDuration");
        });

        it("should create stream with zero threshold", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Approve tokens for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("1000"));

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: 0, // Zero threshold (no minimum requirement)
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("0"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.emit(fixture.contracts.streamFactory, "StreamCreated");
        });

        it("should emit StreamCreated event with correct parameters", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Approve tokens for the factory (including pool amount)
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("1100"));

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("100"),
                },
                tosVersion: "1.0",
            };

            // Get current stream ID before creation
            const currentStreamId = await fixture.contracts.streamFactory.currentStreamId();

            const tx = await fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage);
            const receipt = await tx.wait();
            expect(receipt).to.not.be.null;

            // Find the StreamCreated event
            const streamCreatedEvent = receipt!.logs.find((log: any) => {
                try {
                    const parsed = fixture.contracts.streamFactory.interface.parseLog(log);
                    return parsed?.name === "StreamCreated";
                } catch {
                    return false;
                }
            });

            expect(streamCreatedEvent).to.not.be.undefined;

            // Parse the event to verify the parameters
            const parsedEvent = fixture.contracts.streamFactory.interface.parseLog(streamCreatedEvent!);
            expect(parsedEvent).to.not.be.null;
            expect(parsedEvent!.args[0]).to.equal(await fixture.contracts.streamFactory.getAddress()); // factory
            expect(parsedEvent!.args[1]).to.equal(createStreamMessage.outSupplyToken); // outSupplyToken
            expect(parsedEvent!.args[2]).to.equal(createStreamMessage.inSupplyToken); // inSupplyToken
            expect(parsedEvent!.args[3]).to.not.equal(ethers.ZeroAddress); // stream address
            expect(parsedEvent!.args[4]).to.not.equal(ethers.ZeroAddress); // positionStorage address
            expect(parsedEvent!.args[5]).to.equal(createStreamMessage.streamOutAmount); // streamOutAmount
            expect(parsedEvent!.args[6]).to.equal(createStreamMessage.bootstrappingStartTime); // bootstrappingStartTime
            expect(parsedEvent!.args[7]).to.equal(createStreamMessage.streamStartTime); // streamStartTime
            expect(parsedEvent!.args[8]).to.equal(createStreamMessage.streamEndTime); // streamEndTime
            expect(parsedEvent!.args[9]).to.equal(createStreamMessage.threshold); // threshold
            expect(parsedEvent!.args[10]).to.equal(createStreamMessage.metadata.ipfsHash); // ipfsHash
            expect(parsedEvent!.args[11]).to.equal(createStreamMessage.tosVersion); // tosVersion
            expect(parsedEvent!.args[12]).to.equal(currentStreamId); // streamId
        });

        it("should increment stream ID correctly", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Approve tokens for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("2000"));

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("0"),
                },
                tosVersion: "1.0",
            };

            // Get initial stream ID
            const initialStreamId = await fixture.contracts.streamFactory.currentStreamId();

            // Create first stream
            await fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage);
            const streamIdAfterFirst = await fixture.contracts.streamFactory.currentStreamId();
            expect(streamIdAfterFirst).to.equal(initialStreamId + 1n);

            // Create second stream
            await fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage);
            const streamIdAfterSecond = await fixture.contracts.streamFactory.currentStreamId();
            expect(streamIdAfterSecond).to.equal(initialStreamId + 2n);
        });

        it("should handle very large amounts", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Use very large amounts (close to uint256 max but not overflowing)
            const veryLargeAmount = ethers.parseEther("1000000000"); // 1 billion tokens

            // Mint more tokens to the creator
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .mint(fixture.accounts.creator.address, veryLargeAmount);

            // Approve tokens for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), veryLargeAmount);

            const now = Math.floor(Date.now() / 1000);
            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: veryLargeAmount,
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: veryLargeAmount / 2n,
                metadata: {
                    ipfsHash: "QmTest123",
                },
                creatorVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                beneficiaryVesting: {
                    isVestingEnabled: false,
                    vestingDuration: 0,
                },
                poolInfo: {
                    poolOutSupplyAmount: ethers.parseEther("0"),
                },
                tosVersion: "1.0",
            };

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.emit(fixture.contracts.streamFactory, "StreamCreated");
        });

        it("should revert if waiting, bootstrapping, or stream duration is just below the minimum", async function () {
            // Set minimums to 1 hour (3600 seconds)
            const minDuration = 3600;
            const fixture = await loadFixture(streamFactory().minDurations(minDuration, minDuration, minDuration).build());

            // Approve tokens for the factory
            await fixture.contracts.outSupplyToken
                .connect(fixture.accounts.creator)
                .approve(await fixture.contracts.streamFactory.getAddress(), ethers.parseEther("1000"));

            const now = Math.floor(Date.now() / 1000);

            // 1. Waiting duration below minimum (others valid)
            let createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: await fixture.contracts.outSupplyToken.getAddress(),
                bootstrappingStartTime: now + minDuration - 1, // 1 second less than minimum
                streamStartTime: now + minDuration + minDuration, // valid bootstrapping
                streamEndTime: now + minDuration + minDuration + minDuration, // valid stream
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("0") },
                tosVersion: "1.0",
            };
            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "WaitingDurationTooShort");

            // 2. Bootstrapping duration below minimum (others valid)
            createStreamMessage = {
                ...createStreamMessage,
                bootstrappingStartTime: now + minDuration, // valid waiting
                streamStartTime: now + minDuration + minDuration - 1, // 1 second less than minimum bootstrapping
                streamEndTime: now + minDuration + minDuration + minDuration, // valid stream
            };
            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "BootstrappingDurationTooShort");

            // 3. Stream duration below minimum (others valid)
            createStreamMessage = {
                ...createStreamMessage,
                streamStartTime: now + minDuration + minDuration, // valid bootstrapping
                streamEndTime: now + minDuration + minDuration + minDuration - 1, // 1 second less than minimum stream duration
            };
            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).createStream(createStreamMessage)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "StreamDurationTooShort");
        });
    });
});