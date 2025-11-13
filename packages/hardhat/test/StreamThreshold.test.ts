import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "./helpers/StreamFixtureBuilder";

describe("Stream Threshold", function () {
    it("Should refund to creator if threshold is not reached", async function () {
        const { contracts, timeParams, accounts, config } = await loadFixture(
            stream().setThreshold(ethers.parseEther("100")).build(),
        );

        // Fast forward time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.getStreamStatus();
        expect(status).to.equal(3); // Ended phase

        // When finalized out tokens should be refunded first check current balance of the creator
        const creatorBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

        // Finalize the stream
        const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
        await finalizeTx.wait();

        // Check balance of the creator
        const creatorBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
        expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + BigInt(config.streamOutAmount));
    });

    it("Should refund to subscribers if threshold is not reached", async function () {
        const threshold = ethers.parseEther("100");
        const { contracts, timeParams, accounts, config } = await loadFixture(stream().setThreshold(threshold).build());

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.getStreamStatus();
        expect(status).to.equal(2); // Stream phase (Active)

        // Subscribe to the stream with amount which is less than half of the threshold
        await contracts.inSupplyToken
            .connect(accounts.subscriber1)
            .approve(contracts.stream.getAddress(), threshold / BigInt(2) - BigInt(1));
        const subscribeTx = await contracts.stream
            .connect(accounts.subscriber1)
            .subscribe(threshold / BigInt(2) - BigInt(1));
        await subscribeTx.wait();
        // susbcribe with the subscriber2
        await contracts.inSupplyToken
            .connect(accounts.subscriber2)
            .approve(contracts.stream.getAddress(), threshold / BigInt(2) - BigInt(1));
        const subscribeTx2 = await contracts.stream
            .connect(accounts.subscriber2)
            .subscribe(threshold / BigInt(2) - BigInt(1));
        await subscribeTx2.wait();

        // Skip time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx2 = await contracts.stream.syncStreamExternal();
        await tx2.wait();

        // Check status
        const status2 = await contracts.stream.getStreamStatus();
        expect(status2).to.equal(3); // Ended phase

        // Check in supply token balance of subscriber1
        const subscriber1InSupplyTokenBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
        // Subscriber one exits at status ended
        const exitTx = await contracts.stream.connect(accounts.subscriber1).exitStream();
        await exitTx.wait();

        // Check in supply token balance of subscriber1
        const subscriber1InSupplyTokenBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
        expect(subscriber1InSupplyTokenBalanceAfter).to.equal(subscriber1InSupplyTokenBalanceBefore + threshold / BigInt(2) - BigInt(1));

        // Creator finalizes the stream
        const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
        await finalizeTx.wait();

        // Check in supply token balance of subscriber2
        const subscriber2InSupplyTokenBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber2.address);

        // Subscriber two exits at status finalized::refunded
        const exitTx2 = await contracts.stream.connect(accounts.subscriber2).exitStream();
        await exitTx2.wait();

        // Check in supply token balance of subscriber2
        const subscriber2InSupplyTokenBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber2.address);
        expect(subscriber2InSupplyTokenBalanceAfter).to.equal(subscriber2InSupplyTokenBalanceBefore + threshold / BigInt(2) - BigInt(1));

        // After this stream contracts wallet should have 0 balance
        const streamContractInSupplyTokenBalance = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());
        expect(streamContractInSupplyTokenBalance).to.equal(0);

        const streamContractOutSupplyTokenBalance = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());
        expect(streamContractOutSupplyTokenBalance).to.equal(0);


    });

    it("Should finalize normally if threshold is reached", async function () {
        const threshold = ethers.parseEther("100");
        const { contracts, timeParams, accounts, config, factoryParams } = await loadFixture(
            stream().setThreshold(threshold).build(),
        );

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Subscribe to the stream with the subscriber1
        await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), threshold);
        const subscribeTx = await contracts.stream.connect(accounts.subscriber1).subscribe(threshold);
        await subscribeTx.wait();

        // Fast forward time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Threshold is reached
        // When subscriber1 exits at status ended should acquire out tokens
        const subscriber1OutSupplyTokenBalanceBefore = Number(
            await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address),
        );

        // Exit the stream
        const exitTx = await contracts.stream.connect(accounts.subscriber1).exitStream();
        await exitTx.wait();

        // Check balance of the subscriber1
        const subscriber1OutSupplyTokenBalanceAfter = Number(
            await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address),
        );
        expect(subscriber1OutSupplyTokenBalanceAfter).to.equal(
            subscriber1OutSupplyTokenBalanceBefore + Number(config.streamOutAmount),
        );

        // Finalize the stream
        const creatorInSupplyTokenBalanceBefore = Number(await contracts.inSupplyToken.balanceOf(accounts.creator.address));

        const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
        await finalizeTx.wait();

        // Check balance of the creator
        const creatorInSupplyTokenBalanceAfter = Number(await contracts.inSupplyToken.balanceOf(accounts.creator.address));
        const exitFeeRatio = Number(factoryParams.exitFeeRatio.value);
        const ratio = exitFeeRatio / 1000000;
        const expectedBalance = creatorInSupplyTokenBalanceBefore + Number(threshold) - Number(threshold) * ratio;
        expect(creatorInSupplyTokenBalanceAfter).to.equal(expectedBalance);
    });
}); 