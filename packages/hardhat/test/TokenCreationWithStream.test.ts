import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("TokenCreationWithStream", function () {
    describe("Happy Path", function () {
        it("Should create token and stream with correct token distribution", async function () {
            const fixture = await loadFixture(streamFactory().enablePoolCreation(true).build());

            const now = Math.floor(Date.now() / 1000);
            const streamOutAmount = ethers.parseEther("1000");
            const poolOutSupply = ethers.parseEther("100");
            const totalSupply = ethers.parseEther("10000");
            const creatorBalance = totalSupply - streamOutAmount - poolOutSupply;

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: streamOutAmount,
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress, // Will be replaced
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: poolOutSupply, dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "LaunchToken",
                symbol: "LAUNCH",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            const tx = await fixture.contracts.streamFactory
                .connect(fixture.accounts.creator)
                .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo);

            const receipt = await tx.wait();

            // Check TokenCreated event
            await expect(tx)
                .to.emit(fixture.contracts.streamFactory, "TokenCreated")
                .withArgs(
                    (tokenAddress: string) => tokenAddress !== ethers.ZeroAddress,
                    "LaunchToken",
                    "LAUNCH",
                    18,
                    totalSupply
                );

            // Check StreamCreated event
            await expect(tx).to.emit(fixture.contracts.streamFactory, "StreamCreated");

            // Get token address from event
            const tokenCreatedEvent = receipt?.logs.find((log) => {
                try {
                    const parsed = fixture.contracts.streamFactory.interface.parseLog(log);
                    return parsed?.name === "TokenCreated";
                } catch {
                    return false;
                }
            });

            const parsedEvent = fixture.contracts.streamFactory.interface.parseLog(tokenCreatedEvent!);
            const tokenAddress = parsedEvent?.args.token;

            // Verify token properties
            const token = await ethers.getContractAt("StandardERC20", tokenAddress);
            expect(await token.name()).to.equal("LaunchToken");
            expect(await token.symbol()).to.equal("LAUNCH");
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(totalSupply);

            // Verify token distribution
            // Creator gets their balance
            expect(await token.balanceOf(fixture.accounts.creator.address)).to.equal(creatorBalance);

            // Stream contract gets the stream tokens (factory transfers to stream during _createStream)
            const streams = await fixture.contracts.streamFactory.getStreams();
            const streamAddress = streams[streams.length - 1];
            expect(await token.balanceOf(streamAddress)).to.equal(streamOutAmount + poolOutSupply);
        });

        it("Should create token with custom decimals", async function () {
            const fixture = await loadFixture(streamFactory().enablePoolCreation(true).build());

            const now = Math.floor(Date.now() / 1000);
            const streamOutAmount = ethers.parseUnits("1000", 6);
            const poolOutSupply = ethers.parseUnits("100", 6);
            const totalSupply = ethers.parseUnits("1000000", 6);

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: streamOutAmount,
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseUnits("500", 6),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: poolOutSupply, dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "USDC-Like",
                symbol: "USDC",
                decimals: 6,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            const tx = await fixture.contracts.streamFactory
                .connect(fixture.accounts.creator)
                .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo);

            const receipt = await tx.wait();

            const tokenCreatedEvent = receipt?.logs.find((log) => {
                try {
                    const parsed = fixture.contracts.streamFactory.interface.parseLog(log);
                    return parsed?.name === "TokenCreated";
                } catch {
                    return false;
                }
            });

            const parsedEvent = fixture.contracts.streamFactory.interface.parseLog(tokenCreatedEvent!);
            const tokenAddress = parsedEvent?.args.token;

            const token = await ethers.getContractAt("StandardERC20", tokenAddress);
            expect(await token.decimals()).to.equal(6);
            expect(await token.totalSupply()).to.equal(totalSupply);
        });

        it("Should emit TokenCreated event with correct parameters", async function () {
            const fixture = await loadFixture(streamFactory().enablePoolCreation(true).build());

            const now = Math.floor(Date.now() / 1000);
            const totalSupply = ethers.parseEther("5000000");

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500000"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("100000"), dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "TestToken",
                symbol: "TEST",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            )
                .to.emit(fixture.contracts.streamFactory, "TokenCreated")
                .withArgs(
                    (address: string) => address !== ethers.ZeroAddress,
                    "TestToken",
                    "TEST",
                    18,
                    totalSupply
                );
        });
    });

    describe("Error Cases", function () {
        it("Should revert if total supply is less than stream needs", async function () {
            const fixture = await loadFixture(streamFactory().enablePoolCreation(true).build());

            const now = Math.floor(Date.now() / 1000);
            const streamOutAmount = ethers.parseEther("1000");
            const poolOutSupply = ethers.parseEther("100");
            const insufficientTotalSupply = ethers.parseEther("500"); // Less than streamOut + poolOut

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: streamOutAmount,
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: poolOutSupply, dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "InsufficientToken",
                symbol: "INSUF",
                decimals: 18,
                totalSupply: insufficientTotalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidTokenTotalSupply");
        });

        it("Should revert if total supply equals stream needs (no creator balance)", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const streamOutAmount = ethers.parseEther("1000");
            const poolOutSupply = ethers.parseEther("100");
            const exactTotalSupply = streamOutAmount + poolOutSupply; // Exactly what stream needs (validation requires >)

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: streamOutAmount,
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: poolOutSupply, dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "ExactToken",
                symbol: "EXACT",
                decimals: 18,
                totalSupply: exactTotalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            // Expect revert: pool wrappers are required when poolOutSupplyAmount > 0
            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "PoolWrapperNotSet");
        });

        it("Should revert if stream out amount is zero", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const totalSupply = ethers.parseEther("10000");

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: 0, // Zero amount
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("100"), dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "ZeroOutToken",
                symbol: "ZERO",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "ZeroOutSupplyNotAllowed");
        });

        it("Should revert if creator is zero address", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const totalSupply = ethers.parseEther("10000");

            const createStreamMessage = {
                creator: ethers.ZeroAddress, // Invalid creator
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("100"), dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "InvalidCreatorToken",
                symbol: "INVC",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: ethers.ZeroAddress,
                isMintable: false,
                isBurnable: false,
            };

            // ERC20 will revert when trying to mint to zero address before our validation
            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.reverted;
        });

        it("Should revert if in supply token is not accepted", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Create an unaccepted token
            const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
            const unacceptedToken = await ERC20Mock.deploy("Unaccepted", "UNA");
            await unacceptedToken.waitForDeployment();

            const now = Math.floor(Date.now() / 1000);
            const totalSupply = ethers.parseEther("10000");

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await unacceptedToken.getAddress(), // Not accepted
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("100"), dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "UnacceptedInToken",
                symbol: "UNA",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "StreamInputTokenNotAccepted");
        });

        it("Should revert if TOS version is invalid", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const totalSupply = ethers.parseEther("10000");

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now + 3600,
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("100"), dexType: 0 },
                tosVersion: "2.0", // Wrong version
            };

            const tokenCreationInfo = {
                name: "InvalidTOSToken",
                symbol: "TOS",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidToSVersion");
        });

        it("Should revert if bootstrapping time is in the past", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const now = Math.floor(Date.now() / 1000);
            const totalSupply = ethers.parseEther("10000");

            const createStreamMessage = {
                creator: fixture.accounts.creator.address,
                streamOutAmount: ethers.parseEther("1000"),
                inSupplyToken: await fixture.contracts.inSupplyToken.getAddress(),
                outSupplyToken: ethers.ZeroAddress,
                bootstrappingStartTime: now - 3600, // Past time
                streamStartTime: now + 7200,
                streamEndTime: now + 10800,
                threshold: ethers.parseEther("500"),
                metadata: { ipfsHash: "QmTest123" },
                creatorVesting: { isVestingEnabled: false, vestingDuration: 0 },
                beneficiaryVesting: { isVestingEnabled: false, vestingDuration: 0 },
                poolInfo: { poolOutSupplyAmount: ethers.parseEther("100"), dexType: 0 },
                tosVersion: "1.0",
            };

            const tokenCreationInfo = {
                name: "PastTimeToken",
                symbol: "PAST",
                decimals: 18,
                totalSupply: totalSupply,
                initialOwner: fixture.accounts.creator.address,
                isMintable: false,
                isBurnable: false,
            };

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.creator)
                    .createStreamWithTokenCreation(createStreamMessage, tokenCreationInfo)
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidBootstrappingStartTime");
        });
    });
});
