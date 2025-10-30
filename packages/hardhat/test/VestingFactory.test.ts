import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("VestingFactory", function () {
    async function deployVestingFactoryFixture() {
        const [deployer, beneficiary, tokenOwner] = await ethers.getSigners();

        // Deploy mock token
        const MockToken = await ethers.getContractFactory("ERC20Mock");
        const mockToken = await MockToken.deploy("Mock Token", "MTK");
        await mockToken.mint(tokenOwner.address, ethers.parseEther("1000"));

        // Deploy VestingFactory
        const VestingFactory = await ethers.getContractFactory("VestingFactory");
        const vestingFactory = await VestingFactory.deploy();

        return { vestingFactory, mockToken, deployer, beneficiary, tokenOwner };
    }

    describe("createVestingWalletWithTokens", function () {
        it("Should create vesting wallet successfully with valid parameters", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            const duration = 86400; // 1 day
            const amount = ethers.parseEther("100");

            // Approve tokens
            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            // Create vesting wallet
            const tx = await vestingFactory
                .connect(tokenOwner)
                .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount);

            // Verify event emission
            await expect(tx)
                .to.emit(vestingFactory, "VestingWalletCreated");

            // Verify vesting wallet was created and has tokens
            const receipt = await tx.wait();

            // Find the VestingWalletCreated event in the logs
            const vestingWalletCreatedEvent = receipt!.logs.find(log => {
                try {
                    const parsed = vestingFactory.interface.parseLog(log as any);
                    return parsed?.name === "VestingWalletCreated";
                } catch {
                    return false;
                }
            });

            expect(vestingWalletCreatedEvent).to.not.be.undefined;

            const event = vestingFactory.interface.parseLog(vestingWalletCreatedEvent as any);
            const vestingWalletAddress = event!.args!.vestingWallet;

            expect(vestingWalletAddress).to.not.equal(ethers.ZeroAddress);
            expect(await mockToken.balanceOf(vestingWalletAddress)).to.equal(amount);
        });

        it("Should vest native tokens when token is zero address and msg.value == amount", async function () {
            const { vestingFactory, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 86400;
            const amount = ethers.parseEther("1");

            const tx = await vestingFactory
                .connect(tokenOwner)
                .createVestingWalletWithTokens(beneficiary.address, startTime, duration, ethers.ZeroAddress, amount, {
                    value: amount,
                });

            const receipt = await tx.wait();
            const vestingWalletCreatedLog = receipt!.logs.find(log => {
                try {
                    const parsed = vestingFactory.interface.parseLog(log as any);
                    return parsed?.name === "VestingWalletCreated";
                } catch {
                    return false;
                }
            });

            expect(vestingWalletCreatedLog).to.not.be.undefined;
            const event = vestingFactory.interface.parseLog(vestingWalletCreatedLog as any);
            const vestingWalletAddress = event!.args!.vestingWallet as string;

            expect(vestingWalletAddress).to.not.equal(ethers.ZeroAddress);
            expect(await ethers.provider.getBalance(vestingWalletAddress)).to.equal(amount);
        });

        it("Should revert if msg.value != amount for native token vesting", async function () {
            const { vestingFactory, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 86400;
            const amount = ethers.parseEther("1");

            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, ethers.ZeroAddress, amount, {
                        value: 0n,
                    })
            ).to.be.reverted; // TransferLib.IncorrectNativeAmount
        });

        it("Beneficiary can claim native after vesting ends", async function () {
            const { vestingFactory, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))!.timestamp;
            const startTime = BigInt(now) + 10n; // 10s in future
            const duration = 60n; // 1 minute
            const amount = ethers.parseEther("1");

            const tx = await vestingFactory
                .connect(tokenOwner)
                .createVestingWalletWithTokens(beneficiary.address, Number(startTime), Number(duration), ethers.ZeroAddress, amount, {
                    value: amount,
                });
            const receipt = await tx.wait();
            const vestingWalletCreatedLog = receipt!.logs.find(log => {
                try {
                    const parsed = vestingFactory.interface.parseLog(log as any);
                    return parsed?.name === "VestingWalletCreated";
                } catch {
                    return false;
                }
            });
            const event = vestingFactory.interface.parseLog(vestingWalletCreatedLog as any);
            const vestingWalletAddress = event!.args!.vestingWallet as string;

            // Fast-forward to after vesting end
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime + duration + 1n)]);
            await ethers.provider.send("evm_mine", []);

            // Call release() from beneficiary
            const vestingWallet = new ethers.Contract(vestingWalletAddress, ["function release() external"], beneficiary);
            await vestingWallet.release();

            // Vesting wallet balance should be zero afterwards
            expect(await ethers.provider.getBalance(vestingWalletAddress)).to.equal(0n);
        });

        it("Should revert when startTime is zero", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = 0; // Invalid start time
            const duration = 86400;
            const amount = ethers.parseEther("100");

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount)
            ).to.be.revertedWithCustomError(vestingFactory, "InvalidStartTime");
        });

        it("Should revert when duration is zero", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 0; // Invalid duration
            const amount = ethers.parseEther("100");

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount)
            ).to.be.revertedWithCustomError(vestingFactory, "InvalidDuration");
        });

        // removed: zero-address token is valid for native vesting

        it("Should revert when amount is zero", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 86400;
            const amount = 0; // Invalid amount

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount)
            ).to.be.revertedWithCustomError(vestingFactory, "InvalidAmount");
        });

        it("Should revert when token transfer fails due to insufficient allowance", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 86400;
            const amount = ethers.parseEther("100");

            // Don't approve tokens - this should cause transfer to fail
            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount)
            ).to.be.reverted; // ERC20InsufficientAllowance error from OpenZeppelin
        });

        it("Should revert when token transfer fails due to insufficient balance", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 86400;
            const amount = ethers.parseEther("2000"); // More than available balance

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount)
            ).to.be.reverted; // ERC20InsufficientBalance error from OpenZeppelin
        });

        it("Should handle edge case with very large amounts", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 86400;
            const amount = ethers.parseEther("999"); // Large but valid amount

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            const tx = await vestingFactory
                .connect(tokenOwner)
                .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount);

            await expect(tx)
                .to.emit(vestingFactory, "VestingWalletCreated");
        });

        it("Should handle edge case with very long duration", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            const startTime = Math.floor(Date.now() / 1000) + 3600;
            const duration = 365 * 24 * 3600; // 1 year
            const amount = ethers.parseEther("100");

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            const tx = await vestingFactory
                .connect(tokenOwner)
                .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount);

            await expect(tx)
                .to.emit(vestingFactory, "VestingWalletCreated");
        });

        it("Should revert when startTime is in the past", async function () {
            const { vestingFactory, mockToken, beneficiary, tokenOwner } = await loadFixture(deployVestingFactoryFixture);

            // Get the current block timestamp
            const blockNum = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock(blockNum);
            const now = block!.timestamp;

            const startTime = now - 10; // 10 seconds in the past
            const duration = 86400;
            const amount = ethers.parseEther("100");

            await mockToken.connect(tokenOwner).approve(vestingFactory.getAddress(), amount);

            await expect(
                vestingFactory
                    .connect(tokenOwner)
                    .createVestingWalletWithTokens(beneficiary.address, startTime, duration, mockToken.getAddress(), amount)
            ).to.be.revertedWithCustomError(vestingFactory, "InvalidStartTime");
        });
    });
}); 