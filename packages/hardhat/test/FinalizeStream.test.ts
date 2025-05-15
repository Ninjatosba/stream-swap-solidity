import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "./helpers/StreamFixtureBuilder";

enum Status {
    Waiting,
    Bootstrapping,
    Active,
    Ended,
    FinalizedRefunded,
    FinalizedStreamed,
    Cancelled
}

describe("Stream Finalize", function () {
    describe("Finalize with Threshold Reached", function () {
        it("Should finalize stream and collect fees when threshold is reached", async function () {
            const exitFeeRatio = 20000;
            const { contracts, timeParams, accounts, factoryParams } = await loadFixture(stream().exitRatio(exitFeeRatio).build());

            // Fast forward time to stream start
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Subscribe to the stream with amount above threshold
            const threshold = (await contracts.stream.getStreamState()).threshold;
            const subscribeAmount = threshold * BigInt(2);
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Check initial balances
            const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
            const feeCollectorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);

            // Finalize the stream
            const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
            await finalizeTx.wait();

            // Check final balances
            const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
            const feeCollectorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);
            const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());
            // Calculate expected fees and revenue
            const fee = (subscribeAmount * BigInt(exitFeeRatio)) / BigInt(1e6);
            const expectedCreatorRevenue = subscribeAmount - fee;

            // Verify balances
            expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(expectedCreatorRevenue);
            expect(feeCollectorInBalanceAfter - feeCollectorInBalanceBefore).to.equal(fee);
            expect(streamInBalanceAfter).to.equal(0); // Stream should have no remaining balance

            // Verify event emission
            await expect(finalizeTx)
                .to.emit(contracts.stream, "FinalizedStreamed")
                .withArgs(
                    contracts.stream.getAddress(),
                    accounts.creator.address,
                    expectedCreatorRevenue,
                    fee,
                    0n,
                );
        });

        it("Should handle multiple subscriptions before finalization", async function () {
            const exitFeeRatio = 20000;
            const { contracts, timeParams, accounts, config, factoryParams } = await loadFixture(stream().exitRatio(exitFeeRatio).build());

            // Fast forward time to stream start
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // First subscription
            const threshold = (await contracts.stream.getStreamState()).threshold;
            const subscribeAmount1 = threshold / 2n;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount1
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount1);

            // Second subscription
            const subscribeAmount2 = threshold;
            await contracts.inSupplyToken.connect(accounts.subscriber2).approve(
                contracts.stream.getAddress(),
                subscribeAmount2
            );
            await contracts.stream.connect(accounts.subscriber2).subscribe(subscribeAmount2);

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Check initial balances
            const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
            const feeCollectorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);

            // Finalize the stream
            const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
            await finalizeTx.wait();

            // Check final balances
            const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
            const feeCollectorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);
            const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            const totalSubscribed = subscribeAmount1 + subscribeAmount2;
            const fee = (totalSubscribed * BigInt(exitFeeRatio)) / BigInt(1e6);
            const expectedCreatorRevenue = totalSubscribed - fee;

            // Verify balances
            expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(expectedCreatorRevenue);
            expect(feeCollectorInBalanceAfter - feeCollectorInBalanceBefore).to.equal(fee);
            expect(streamInBalanceAfter).to.equal(0); // Stream should have no remaining balance

            // Verify event emission
            await expect(finalizeTx)
                .to.emit(contracts.stream, "FinalizedStreamed")
                .withArgs(
                    contracts.stream.getAddress(),
                    accounts.creator.address,
                    expectedCreatorRevenue,
                    fee,
                    0n,
                );
        });
    });

    describe("Finalize with Threshold Not Reached", function () {
        it("Should finalize stream and refund out tokens when threshold is not reached", async function () {
            const { contracts, timeParams, accounts, config } = await loadFixture(stream().build());

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Check initial balances
            const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Finalize the stream
            const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
            await finalizeTx.wait();

            // Check final balances
            const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify balances
            expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
            expect(streamOutBalanceAfter).to.equal(0);

            // Verify event emission
            await expect(finalizeTx)
                .to.emit(contracts.stream, "FinalizedRefunded")
                .withArgs(
                    contracts.stream.getAddress(),
                    accounts.creator.address,
                    config.streamOutAmount,
                );
        });
    });

    describe("Finalize Edge Cases", function () {
        it("Should not allow finalize before stream end", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            await expect(contracts.stream.connect(accounts.creator).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should not allow non-creator to finalize", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            await expect(contracts.stream.connect(accounts.subscriber1).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
        });

        it("Should not allow finalize after already finalized", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Finalize once
            await contracts.stream.connect(accounts.creator).finalizeStream();

            // Try to finalize again
            await expect(contracts.stream.connect(accounts.creator).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should handle recurring finalize attempts by different users", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // First finalize by creator
            await contracts.stream.connect(accounts.creator).finalizeStream();

            // Try to finalize again by different users
            await expect(contracts.stream.connect(accounts.subscriber1).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");

            await expect(contracts.stream.connect(accounts.subscriber2).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");

            await expect(contracts.stream.connect(accounts.protocolAdmin).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");

            await expect(contracts.stream.connect(accounts.protocolAdmin).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
            // Requiring finalize call by creator
            await expect(contracts.stream.connect(accounts.creator).finalizeStream())
                .to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should handle finalize with no subscriptions and zero threshold", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(0n).build());

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Check initial balances
            const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Finalize the stream
            const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
            await finalizeTx.wait();

            // Check final balances
            const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify balances
            expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
            expect(streamOutBalanceAfter).to.equal(0);

            // Verify status
            expect(await contracts.stream.streamStatus()).to.equal(Status.FinalizedStreamed);
        });

        it("Should handle finalize with no subscriptions and non-zero threshold", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(100n).build());

            // Fast forward time to stream end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream
            await contracts.stream.syncStreamExternal();

            // Check initial balances
            const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Finalize the stream
            const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
            await finalizeTx.wait();

            // Check final balances
            const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
            const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify balances
            expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
            expect(streamOutBalanceAfter).to.equal(0);

            // Verify status
            expect(await contracts.stream.streamStatus()).to.equal(Status.FinalizedRefunded);
        });


    });
});
