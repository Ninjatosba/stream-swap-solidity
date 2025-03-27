import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "./helpers/StreamFixtureBuilder";

describe("Stream Cancel", function () {
    describe("Normal Cancel", function () {
        it("Creator should be able to cancel stream in WAITING status and receive exact refund", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            // Check initial status is WAITING
            const initialStatus = await contracts.stream.getStreamStatus();
            expect(initialStatus).to.equal(0); // WAITING

            // Get stream state before cancellation
            const streamState = await contracts.stream.getStreamState();

            const creatorBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

            // Cancel the stream
            await contracts.stream.connect(accounts.creator).cancelStream();

            // Check status is now CANCELLED
            const finalStatus = await contracts.stream.getStreamStatus();
            expect(finalStatus).to.equal(6); // CANCELLED

            // Verify creator received exact refund amount
            const finalCreatorBalance = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            expect(finalCreatorBalance).to.equal(
                creatorBalanceBefore + streamState.outSupply
            );

            // Verify stream contract has 0 balance
            const streamBalance = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());
            expect(streamBalance).to.equal(0);
        });

        it("Should not allow creator to cancel if already cancelled", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            // First cancellation
            await contracts.stream.connect(accounts.creator).cancelStream();

            // Second cancellation should fail
            await expect(contracts.stream.connect(accounts.creator).cancelStream())
                .to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should not allow creator to cancel during bootstrapping phase", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Move to bootstrapping phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            await contracts.stream.syncStreamExternal();

            await expect(contracts.stream.connect(accounts.creator).cancelStream())
                .to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should not allow non-creator to cancel stream", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            await expect(contracts.stream.connect(accounts.subscriber1).cancelStream())
                .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
        });
    });

    describe("Admin Cancel", function () {
        it("Protocol admin should be able to cancel stream in ACTIVE status", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Move to active phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Subscribe with some amount
            const subscribeAmount = ethers.parseEther("1");
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

            // Get balances before cancellation
            const creatorBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamStateBefore = await contracts.stream.getStreamState();

            // Cancel with admin
            await contracts.stream.connect(accounts.deployer).cancelWithAdmin();

            // Check final balances
            const creatorBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(streamStateBefore.outSupply);
        });

        it("Should handle cancellation at stream boundaries correctly", async function () {
            const { contracts, timeParams } = await loadFixture(stream().build());

            // Test cancellation at exact bootstrapping start
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime]);
            await ethers.provider.send("evm_mine", []);

            await contracts.stream.syncStreamExternal();
            await expect(contracts.stream.cancelWithAdmin()).to.not.be.reverted;
        });

        it("Should fail admin cancel if caller is not protocol admin", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            // Try cancelling with different non-admin accounts
            for (const account of [accounts.subscriber1, accounts.subscriber2]) {
                await expect(contracts.stream.connect(account).cancelWithAdmin())
                    .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
            }
        });

        it("Should not allow admin cancel after stream is finalized", async function () {
            const { contracts, timeParams } = await loadFixture(stream().build());

            // Move to ended status and finalize
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            await contracts.stream.syncStreamExternal();

            await expect(contracts.stream.cancelWithAdmin())
                .to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should emit correct StreamCancelled event on normal cancel", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            const streamState = await contracts.stream.getStreamState();

            await expect(contracts.stream.connect(accounts.creator).cancelStream())
                .to.emit(contracts.stream, "StreamCancelled")
                .withArgs(
                    contracts.stream.getAddress(),
                    accounts.creator.address,
                    streamState.outSupply,
                    6 // CANCELLED status
                );
        });

        it("Should refund all tokens when admin cancels with multiple subscribers", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Move to active phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Multiple subscribers subscribe
            const subscribeAmount = ethers.parseEther("1");
            for (const subscriber of [accounts.subscriber1, accounts.subscriber2]) {
                await contracts.inSupplyToken.connect(subscriber).approve(
                    contracts.stream.getAddress(),
                    subscribeAmount
                );
                await contracts.stream.connect(subscriber).subscribe(subscribeAmount);
            }

            const creatorBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamStateBefore = await contracts.stream.getStreamState();

            // Cancel with admin
            await contracts.stream.connect(accounts.deployer).cancelWithAdmin();

            // Verify all out tokens returned to creator
            const creatorBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(streamStateBefore.outSupply);

            // Verify stream contract has 0 balance
            const streamBalance = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());
            expect(streamBalance).to.equal(0);
        });
    });
});
