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


describe("Stream Exit", function () {
    describe("Successful Exit (Status.Ended)", function () {
        it("Should allow exit and distribute out tokens when stream is ended", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Subscribe with amount equal to threshold
            const threshold = (await contracts.stream.getStreamState()).threshold;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                threshold
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(threshold);

            // Fast forward time to ended phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Check status is ended
            expect((await contracts.stream.getStreamStatus())).to.equal(Status.Ended);

            // Get balances before exit
            const subscriberOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Exit the stream
            await contracts.stream.connect(accounts.subscriber1).exitStream();

            // Check balances after exit
            const subscriberOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify subscriber received out tokens
            expect(subscriberOutBalanceAfter - subscriberOutBalanceBefore).to.be.gt(0);
            // Verify stream contract has less out tokens
            expect(streamOutBalanceBefore - streamOutBalanceAfter).to.be.gt(0);

            // Status is still ended because threshold was reached but its not finalized
            expect((await contracts.stream.getStreamStatus())).to.equal(Status.Ended);
        });
    });

    describe("Refund Exit (Status.Ended)", function () {
        it("Should refund in tokens when stream is ended and threshold not reached", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Subscribe with amount less than threshold
            const threshold = (await contracts.stream.getStreamState()).threshold;
            const subscribeAmount = threshold / BigInt(2);
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

            // Fast forward time to ended phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Check status is ended
            expect((await contracts.stream.getStreamStatus())).to.equal(Status.Ended);

            // Get balances before exit
            const subscriberInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamInBalanceBefore = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            // Exit the stream
            await contracts.stream.connect(accounts.subscriber1).exitStream();

            // Check balances after exit
            const subscriberInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify subscriber received full refund of in tokens
            expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
            // Verify stream contract has no in tokens
            expect(streamInBalanceAfter).to.equal(0);
        });
    });

    describe("Refund Exit (Status.Cancelled)", function () {
        it("Should refund in tokens when stream is cancelled", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Subscribe with some amount
            const subscribeAmount = ethers.parseEther("100");
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

            // Cancel the stream
            await contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin();

            // Check status is cancelled
            expect((await contracts.stream.getStreamStatus())).to.equal(Status.Cancelled);

            // Get balances before exit
            const subscriberInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamInBalanceBefore = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            // Exit the stream
            await contracts.stream.connect(accounts.subscriber1).exitStream();

            // Check balances after exit
            const subscriberInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify subscriber received full refund of in tokens
            expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
            // Verify stream contract has no in tokens
            expect(streamInBalanceAfter).to.equal(0);
        });
    });

    describe("Refund Exit (Status.FinalizedRefunded)", function () {
        it("Should refund in tokens when stream is finalized with refund", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Subscribe with amount less than threshold
            const threshold = (await contracts.stream.getStreamState()).threshold;
            const subscribeAmount = threshold / BigInt(2);
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

            // Fast forward time to ended phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Finalize the stream (which will be in refunded state since threshold not reached)
            await contracts.stream.connect(accounts.creator).finalizeStream();

            // Check status is finalized refunded
            expect((await contracts.stream.getStreamStatus())).to.equal(Status.FinalizedRefunded);

            // Get balances before exit
            const subscriberInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamInBalanceBefore = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            // Exit the stream
            await contracts.stream.connect(accounts.subscriber1).exitStream();

            // Check balances after exit
            const subscriberInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
            const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

            // Verify subscriber received full refund of in tokens
            expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
            // Verify stream contract has no in tokens
            expect(streamInBalanceAfter).to.equal(0);
        });
    });

    describe("Event Emission", function () {
        it("Should emit Exited event on successful exit", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Subscribe with some amount
            const subscribeAmount = ethers.parseEther("100");
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(
                contracts.stream.getAddress(),
                subscribeAmount
            );
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

            // Fast forward time to ended phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Sync position to get latest state
            await contracts.stream.syncPosition(accounts.subscriber1.address);

            // Get current block timestamp
            const currentBlock = await ethers.provider.getBlock("latest");
            if (!currentBlock) throw new Error("Failed to get current block");

            // Exit the stream and check event emission
            const tx = await contracts.stream.connect(accounts.subscriber1).exitStream();
            const receipt = await tx.wait();

            // Get the event from the receipt
            const event = receipt?.logs.find(log => log.topics[0] === contracts.stream.interface.getEvent("Exited").topicHash);
            expect(event).to.not.be.undefined;

            // Check the event arguments
            const parsedEvent = contracts.stream.interface.parseLog({
                topics: event!.topics,
                data: event!.data
            });
            expect(parsedEvent?.args.streamAddress).to.equal(await contracts.stream.getAddress());
            expect(parsedEvent?.args.subscriber).to.equal(accounts.subscriber1.address);
            expect(parsedEvent?.args.purchased).to.equal((await contracts.stream.getPosition(accounts.subscriber1.address)).purchased);
            expect(parsedEvent?.args.spentIn).to.equal(subscribeAmount);
            expect(parsedEvent?.args.exitTimestamp).to.be.closeTo(currentBlock.timestamp, 1);
        });
    });
});
