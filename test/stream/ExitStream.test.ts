import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import {
  Status,
  Amounts,
  Durations,
} from "../types";
import {
  advanceToPhase,
  timeTravel,
  getCurrentTimestamp,
} from "../helpers/time";
import {
  subscribeAndSync,
  advanceStreamToPhase,
} from "../helpers/stream";
import {
  getBalance,
  expectNativeBalanceChangeWithGas,
} from "../helpers/balances";

describe("Stream Exit", function () {
  describe("Successful Exit (Status.Ended)", function () {
    it("Should allow exit and distribute out tokens when stream is ended", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with amount equal to threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, threshold, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check status is ended
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Ended);

      // Get balances before exit
      const subscriberOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.subscriber1);
      const streamOutBalanceBefore = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Exit the stream
      await contracts.stream.connect(accounts.subscriber1).exitStream();

      // Check balances after exit
      const subscriberOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.subscriber1);
      const streamOutBalanceAfter = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

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
          .beneficiaryVesting(Durations.ONE_HOUR)
          .setThreshold(Amounts.DEFAULT_THRESHOLD)
          .build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with threshold amount to ensure success
      const threshold = (await contracts.stream.getStreamState()).threshold;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, threshold, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Exit with vesting enabled
      const exitTx = await contracts.stream.connect(accounts.subscriber1).exitStream();
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

      // Check vesting wallet balance - should get the full stream out amount
      const vestingWalletBalance = await contracts.outSupplyToken.balanceOf(vestingWalletAddress);
      expect(vestingWalletBalance).to.equal(config.streamOutAmount);

      // Verify the exit was successful
      const position = await contracts.stream.getPosition(accounts.subscriber1.address);
      expect(position.exitDate).to.be.gt(0);
    });
  });

  describe("Refund Exit (Status.Ended)", function () {
    it("Should refund in tokens when stream is ended and threshold not reached", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with amount less than threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount = threshold / 2n;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check status is ended
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Ended);

      // Get balances before exit
      const subscriberInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.subscriber1);

      // Exit the stream
      await contracts.stream.connect(accounts.subscriber1).exitStream();

      // Check balances after exit
      const subscriberInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.subscriber1);
      const streamInBalanceAfter = await getBalance(contracts.inSupplyToken, await contracts.stream.getAddress());

      // Verify subscriber received full refund of in tokens
      expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
      // Verify stream contract has no in tokens
      expect(streamInBalanceAfter).to.equal(0n);
    });
  });

  describe("Refund Exit (Status.Cancelled)", function () {
    it("Should refund in tokens when stream is cancelled", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with some amount
      const subscribeAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

      // Cancel the stream
      await contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin();

      // Check status is cancelled
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.Cancelled);

      // Get balances before exit
      const subscriberInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.subscriber1);

      // Exit the stream
      await contracts.stream.connect(accounts.subscriber1).exitStream();

      // Check balances after exit
      const subscriberInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.subscriber1);
      const streamInBalanceAfter = await getBalance(contracts.inSupplyToken, await contracts.stream.getAddress());

      // Verify subscriber received full refund of in tokens
      expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
      // Verify stream contract has no in tokens
      expect(streamInBalanceAfter).to.equal(0n);
    });
  });

  describe("Refund Exit (Status.FinalizedRefunded)", function () {
    it("Should refund in tokens when stream is finalized with refund", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with amount less than threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount = threshold / 2n;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Finalize the stream (which will be in refunded state since threshold not reached)
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Check status is finalized refunded
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);

      // Get balances before exit
      const subscriberInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.subscriber1);

      // Exit the stream
      await contracts.stream.connect(accounts.subscriber1).exitStream();

      // Check balances after exit
      const subscriberInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.subscriber1);
      const streamInBalanceAfter = await getBalance(contracts.inSupplyToken, await contracts.stream.getAddress());

      // Verify subscriber received full refund of in tokens
      expect(subscriberInBalanceAfter - subscriberInBalanceBefore).to.equal(subscribeAmount);
      // Verify stream contract has no in tokens
      expect(streamInBalanceAfter).to.equal(0n);

      // Check status is still finalized refunded
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);
    });

    it("Should refund native in tokens when stream is finalized with refund", async function () {
      const threshold = Amounts.DEFAULT_THRESHOLD;
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(threshold).nativeToken().build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with native token (less than threshold)
      const subscribeAmount = threshold / 2n;
      await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithNativeToken(subscribeAmount, [], { value: subscribeAmount });

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Finalize the stream (which will be in refunded state since threshold not reached)
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Check status is finalized refunded
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);

      // Exit and verify native balance change (accounting for gas)
      await expectNativeBalanceChangeWithGas(
        accounts.subscriber1,
        () => contracts.stream.connect(accounts.subscriber1).exitStream(),
        subscribeAmount
      );
    });
  });

  describe("Event Emission", function () {
    it("Should emit ExitRefunded event on refund exit", async function () {
      const threshold = Amounts.DEFAULT_THRESHOLD;
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(threshold).build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with amount less than threshold
      const subscribeAmount = threshold / 2n;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Sync position to get latest state
      await contracts.stream.syncPositionExternal(accounts.subscriber1.address);

      // Get current block timestamp
      const currentTimestamp = await getCurrentTimestamp();

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
      expect(parsedEvent?.args.exitTimestamp).to.be.closeTo(currentTimestamp, 1);
    });

    it("Should emit ExitStreamed event on successful exit", async function () {
      const threshold = Amounts.DEFAULT_THRESHOLD;
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(threshold).build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with amount equal to threshold
      await subscribeAndSync(contracts.stream, accounts.subscriber1, threshold, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Finalize the stream
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Get current block timestamp
      const currentTimestamp = await getCurrentTimestamp();

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
      expect(parsedEvent?.args.exitTimestamp).to.be.closeTo(currentTimestamp, 1);
    });
  });
});
