import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Stream, StreamFactory, ERC20Mock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";
import { stream, StreamFixtureBuilder } from "./helpers/StreamFixtureBuilder";

describe("Stream Status", function () {
    // Basic test with default parameters
    it("Should have start with status WAITING", async function () {
        const { contracts } = await loadFixture(stream().build());
        let status = await contracts.stream.getStreamStatus();
        expect(status).to.equal(0);
    });

    it("Should transition to bootstrapping phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to bootstrapping start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(1); // Bootstrapping phase
    })
    it("Should transition to stream phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(2); // Stream phase (Active)
    })

    it("Should transition to ended phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(3); // Ended phase
    })
});

// Test threshold feature
describe("Stream Threshold", function () {
    it("Should refund to creator if threshold is not reached", async function () {
        const { contracts, timeParams, accounts, config } = await loadFixture(stream().setThreshold(100).build());

        // Fast forward time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(3); // Ended phase

        // When finalized out tokens should be refunded first check current balance of the creator
        let creatorBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

        // Finalize the stream
        let finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
        await finalizeTx.wait();

        // Check balance of the creator
        let creatorBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
        expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + BigInt(config.streamOutAmount));
    })
    it("Should refund to subscribers if threshold is not reached", async function () {
        let threshold = 100;
        const { contracts, timeParams, accounts, config } = await loadFixture(stream().setThreshold(threshold).build());

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(2); // Stream phase (Active)

        // Subscribe to the stream with the subscriber1
        await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), threshold / 2 - 1);
        let subscribeTx = await contracts.stream.connect(accounts.subscriber1).subscribe(threshold / 2 - 1);
        await subscribeTx.wait();
        // susbcribe with the subscriber2
        await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), threshold / 2 - 1);
        let subscribeTx2 = await contracts.stream.connect(accounts.subscriber2).subscribe(threshold / 2 - 1);
        await subscribeTx2.wait();

        // Skip time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx2 = await contracts.stream.syncStreamExternal();
        await tx2.wait();

        // Check status
        const status2 = await contracts.stream.streamStatus();
        expect(status2).to.equal(3); // Ended phase

        // Subscriber one exits at status ended 
        let exitTx = await contracts.stream.connect(accounts.subscriber1).exitStream();
        await exitTx.wait();

        // Creator finalizes the stream
        let finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
        await finalizeTx.wait();

        // Subscriber two exits at status finalized::refunded
        let exitTx2 = await contracts.stream.connect(accounts.subscriber2).exitStream();
        await exitTx2.wait();

        // After this stream contracts wallet should have 0 balance
        let streamContractInSupplyTokenBalance = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());
        expect(streamContractInSupplyTokenBalance).to.equal(0);

        let streamContractOutSupplyTokenBalance = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());
        expect(streamContractOutSupplyTokenBalance).to.equal(0);

        // Check native token balance of the stream contract
        let streamContractNativeTokenBalance = await ethers.provider.getBalance(contracts.stream.getAddress());
        expect(streamContractNativeTokenBalance).to.equal(0);
    });

    it("Should finalize normally if threshold is reached", async function () {
        let threshold = 100;
        const { contracts, timeParams, accounts, config, factoryParams } = await loadFixture(stream().setThreshold(threshold).build());

        console.log("Initial setup:");
        console.log("Threshold:", threshold);
        console.log("Factory params:", factoryParams);

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Subscribe to the stream with the subscriber1
        await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), threshold);
        let subscribeTx = await contracts.stream.connect(accounts.subscriber1).subscribe(threshold);
        await subscribeTx.wait();


        // Fast forward time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Threshold is reached
        // When subscriber1 exits at status ended should acquire out tokens
        let subscriber1OutSupplyTokenBalanceBefore = Number(await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address));

        // Exit the stream
        let exitTx = await contracts.stream.connect(accounts.subscriber1).exitStream();
        await exitTx.wait();

        // Check balance of the subscriber1
        let subscriber1OutSupplyTokenBalanceAfter = Number(await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address));
        expect(subscriber1OutSupplyTokenBalanceAfter).to.equal(subscriber1OutSupplyTokenBalanceBefore + Number(config.streamOutAmount));

        // Finalize the stream
        let creatorInSupplyTokenBalanceBefore = Number(await contracts.inSupplyToken.balanceOf(accounts.creator.address));

        let finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
        await finalizeTx.wait();

        // Check balance of the creator
        let creatorInSupplyTokenBalanceAfter = Number(await contracts.inSupplyToken.balanceOf(accounts.creator.address));
        let exitFeeRatio = Number(factoryParams.exitFeeRatio.value);
        let ratio = exitFeeRatio / 1000000;
        let expectedBalance = creatorInSupplyTokenBalanceBefore + threshold - (threshold * ratio);

        expect(creatorInSupplyTokenBalanceAfter).to.equal(expectedBalance);
    });
});

describe("Stream Recurring subscription", function () {
    it("Should create a recurring subscription", async function () {
        const { contracts, timeParams, accounts, config } = await loadFixture(stream().build());

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        let tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(2); // Stream phase (Active)

        // Subscribe to the stream
        await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), 100);
        let subscribeTx = await contracts.stream.connect(accounts.subscriber1).subscribe(100);
        await subscribeTx.wait();

        // Subscribe to the stream again
        await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), 100);
        let subscribeTx2 = await contracts.stream.connect(accounts.subscriber1).subscribe(100);
        await subscribeTx2.wait();
    });
});