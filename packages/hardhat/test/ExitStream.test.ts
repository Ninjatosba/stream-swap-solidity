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
  Cancelled,
}

describe("Stream Exit", function () {
  describe("Successful Exit (Status.Ended)", function () {
    it("Should allow exit and distribute out tokens when stream is ended", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(ethers.parseEther("100")).build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with amount equal to threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), threshold);
      await contracts.stream.connect(accounts.subscriber1).subscribe(threshold);

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Check status is ended
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Ended);

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
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Ended);
    });
    it("Should handle exit when beneficiary vesting is enabled", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream()
          .beneficiaryVesting(3600) // 1 hour vesting
          .setThreshold(ethers.parseEther("100"))
          .build()
      );

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx = await contracts.stream.syncStreamExternal();
      await tx.wait();

      // Subscribe to the stream
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscriptionAmount = threshold; // Subscribe with threshold amount to ensure success
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx2 = await contracts.stream.syncStreamExternal();
      await tx2.wait();

      // Exit with vesting enabled
      const exitTx = await contracts.stream.connect(accounts.subscriber1).exitStream();
      await exitTx.wait();

      // Get vesting contract address from logs
      const receipt = await exitTx.wait();

      // Parse VestingWalletCreated events from exitStream transaction
      const iface = new ethers.Interface([
        "event VestingWalletCreated(address indexed beneficiary, address indexed vestingWallet, uint64 startTime, uint64 duration, address token, uint256 amount)",
      ]);

      // Find VestingWalletCreated event in exitStream
      const vestingWalletCreatedLog = receipt?.logs.find(log => {
        try {
          const parsed = iface.parseLog(log as any);
          return parsed?.name === "VestingWalletCreated";
        } catch {
          return false;
        }
      });
      expect(vestingWalletCreatedLog).to.not.be.undefined;

      // Extract vesting wallet address
      const vestingWalletCreatedEvent = iface.parseLog(vestingWalletCreatedLog as any);
      const vestingWalletAddress = vestingWalletCreatedEvent?.args?.vestingWallet;
      expect(vestingWalletAddress).to.not.be.undefined;
      expect(vestingWalletAddress).to.not.be.equal(ethers.ZeroAddress);

      // Check vesting wallet balance
      const vestingWalletBalance = await contracts.outSupplyToken.balanceOf(vestingWalletAddress);
      // Should get the full stream out amount because subscriber1 is the only subscriber
      expect(vestingWalletBalance).to.equal(config.streamOutAmount);

      // Verify the exit was successful
      const position = await contracts.stream.getPosition(accounts.subscriber1.address);
      expect(position.exitDate).to.be.gt(0);
    });
  });

  describe("Refund Exit (Status.Ended)", function () {
    it("Should refund in tokens when stream is ended and threshold not reached", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(ethers.parseEther("100")).build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with amount less than threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount = threshold / BigInt(2);
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Check status is ended
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Ended);

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
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

      // Cancel the stream
      await contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin();

      // Check status is cancelled
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Cancelled);

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
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(ethers.parseEther("100")).build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with amount less than threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount = threshold / BigInt(2);
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Finalize the stream (which will be in refunded state since threshold not reached)
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Check status is finalized refunded
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);

      // Get balances before exit
      const subscriberInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);

      // Exit the stream
      await contracts.stream.connect(accounts.subscriber1).exitStream();

      // Check balances after exit
      const subscriberInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
      const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());


      // Verify subscriber received full refund of in tokens
      expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
      // Verify stream contract has no in tokens
      expect(streamInBalanceAfter).to.equal(0);

      // Check status is finalized refunded
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);
    });

    it("Should refund native in tokens when stream is finalized with refund", async function () {
      const threshold = ethers.parseEther("100");
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(threshold).nativeToken().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with some amount
      const subscribeAmount = threshold / BigInt(2);
      await contracts.stream.connect(accounts.subscriber1).subscribeWithNativeToken(subscribeAmount, { value: subscribeAmount });

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Finalize the stream (which will be in refunded state since threshold not reached)
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Check status is finalized refunded
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);

      // Get balances before exit
      const subscriberInBalanceBefore = await ethers.provider.getBalance(accounts.subscriber1.address);

      // Exit the stream
      let tx = await contracts.stream.connect(accounts.subscriber1).exitStream();
      let receipt = await tx.wait();
      let gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      console.log(`Gas used: ${gasUsed}`);

      // Check balances after exit
      const subscriberInBalanceAfter = await ethers.provider.getBalance(accounts.subscriber1.address);

      // Verify subscriber received full refund of in tokens
      expect(subscriberInBalanceAfter - subscriberInBalanceBefore + gasUsed).to.equal(subscribeAmount);
    });
  });

  describe("Event Emission", function () {
    it("Should emit ExitRefunded event on refund exit", async function () {
      const threshold = ethers.parseEther("100");
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(threshold).build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with some amount
      const subscribeAmount = threshold / BigInt(2);
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Sync position to get latest state
      await contracts.stream.syncPositionExternal(accounts.subscriber1.address);

      // Get current block timestamp
      const currentBlock = await ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      // Exit the stream and check event emission
      const tx = await contracts.stream.connect(accounts.subscriber1).exitStream();
      const receipt = await tx.wait();

      // Get the event from the receipt
      const event = receipt?.logs.find(
        log => log.topics[0] === contracts.stream.interface.getEvent("ExitRefunded").topicHash,
      );
      expect(event).to.not.be.undefined;

      // Check the event arguments
      const parsedEvent = contracts.stream.interface.parseLog({
        topics: event!.topics,
        data: event!.data,
      });
      expect(parsedEvent?.args.streamAddress).to.equal(await contracts.stream.getAddress());
      expect(parsedEvent?.args.subscriber).to.equal(accounts.subscriber1.address);
      expect(parsedEvent?.args.inBalance).to.equal(subscribeAmount);
      expect(parsedEvent?.args.spentIn).to.equal(0);
      expect(parsedEvent?.args.exitTimestamp).to.be.closeTo(currentBlock.timestamp, 1);
    });
    it("Should emit ExitStreamed event on successful exit", async function () {
      const threshold = ethers.parseEther("100");
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(threshold).build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with amount equal to threshold
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), threshold);
      await contracts.stream.connect(accounts.subscriber1).subscribe(threshold);

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Finalize the stream
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Get current block timestamp
      const currentBlock = await ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      // Exit the stream and check event emission
      const tx = await contracts.stream.connect(accounts.subscriber1).exitStream();
      const receipt = await tx.wait();

      // Get the event from the receipt
      const event = receipt?.logs.find(
        log => log.topics[0] === contracts.stream.interface.getEvent("ExitStreamed").topicHash,
      );
      expect(event).to.not.be.undefined;

      // Check the event arguments
      const parsedEvent = contracts.stream.interface.parseLog({
        topics: event!.topics,
        data: event!.data,
      });
      expect(parsedEvent?.args.streamAddress).to.equal(await contracts.stream.getAddress());
      expect(parsedEvent?.args.subscriber).to.equal(accounts.subscriber1.address);
      expect(parsedEvent?.args.purchased).to.equal(
        (await contracts.stream.getPosition(accounts.subscriber1.address)).purchased,
      );
      expect(parsedEvent?.args.spentIn).to.equal(threshold);
      expect(parsedEvent?.args.exitTimestamp).to.be.closeTo(currentBlock.timestamp, 1);
    });
  });
});
