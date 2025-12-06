import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Status, Amounts, Errors } from "../types";
import { advanceStreamToPhase, subscribeAndSync } from "../helpers/stream";
import { getBalance } from "../helpers/balances";
import { advanceToMidPhase, timeTravel } from "../helpers/time";

describe("Stream Finalize", function () {
  describe("Finalize with Threshold Reached", function () {
    it("Should finalize stream and collect fees when threshold is reached", async function () {
      const exitFeeRatio = 20000;
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().exitRatio(exitFeeRatio).setThreshold(Amounts.DEFAULT_THRESHOLD).build(),
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe to the stream with amount above threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount = threshold * 2n;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check initial balances
      const creatorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.creator);
      const feeCollectorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.feeCollector);

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.creator);
      const feeCollectorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.feeCollector);
      const streamInBalanceAfter = await getBalance(contracts.inSupplyToken, await contracts.stream.getAddress());

      // Calculate expected fees and revenue
      const fee = (subscribeAmount * BigInt(exitFeeRatio)) / BigInt(1e6);
      const expectedCreatorRevenue = subscribeAmount - fee;

      // Verify balances
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(expectedCreatorRevenue);
      expect(feeCollectorInBalanceAfter - feeCollectorInBalanceBefore).to.equal(fee);
      expect(streamInBalanceAfter).to.equal(0n);

      // Verify event emission
      await expect(finalizeTx)
        .to.emit(contracts.stream, "FinalizedStreamed")
        .withArgs(contracts.stream.getAddress(), accounts.creator.address, expectedCreatorRevenue, fee, 0n);
    });

    it("Should handle multiple subscriptions before finalization", async function () {
      const exitFeeRatio = 20000;
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().exitRatio(exitFeeRatio).setThreshold(Amounts.DEFAULT_THRESHOLD).build(),
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // First subscription
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount1 = threshold / 2n;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount1, contracts.inSupplyToken);

      // Second subscription
      const subscribeAmount2 = threshold;
      await subscribeAndSync(contracts.stream, accounts.subscriber2, subscribeAmount2, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check initial balances
      const creatorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.creator);
      const feeCollectorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.feeCollector);

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.creator);
      const feeCollectorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.feeCollector);
      const streamInBalanceAfter = await getBalance(contracts.inSupplyToken, await contracts.stream.getAddress());

      const totalSubscribed = subscribeAmount1 + subscribeAmount2;
      const fee = (totalSubscribed * BigInt(exitFeeRatio)) / BigInt(1e6);
      const expectedCreatorRevenue = totalSubscribed - fee;

      // Verify balances
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(expectedCreatorRevenue);
      expect(feeCollectorInBalanceAfter - feeCollectorInBalanceBefore).to.equal(fee);
      expect(streamInBalanceAfter).to.equal(0n);

      // Verify event emission
      await expect(finalizeTx)
        .to.emit(contracts.stream, "FinalizedStreamed")
        .withArgs(contracts.stream.getAddress(), accounts.creator.address, expectedCreatorRevenue, fee, 0n);
    });

  });

  describe("Finalize with Threshold Not Reached", function () {
    it("Should finalize stream and refund out tokens when threshold is not reached", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Query stream state
      const streamState = await contracts.stream.getStreamState();
      const threshold = streamState.threshold;

      // Subscribe to the stream (below threshold)
      const subscribeAmount = threshold - ethers.parseEther("1");
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check initial balances
      const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceBefore = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceAfter = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Verify balances
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
      expect(streamOutBalanceAfter).to.equal(0n);

      // Verify event emission
      await expect(finalizeTx)
        .to.emit(contracts.stream, "FinalizedRefunded")
        .withArgs(contracts.stream.getAddress(), accounts.creator.address, config.streamOutAmount);
    });
  });

  describe("Finalize with StreamPostActions", function () {
    it("Should transfer remaining output tokens to creator when outRemaining > 0", async function () {
      const exitFeeRatio = 20000;
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream()
          .exitRatio(exitFeeRatio)
          .creatorVesting(3600) // Enable creator vesting to use StreamPostActions
          .build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with 100 tokens early in the stream
      await subscribeAndSync(contracts.stream, accounts.subscriber1, 100n, contracts.inSupplyToken);

      // Advance time to half of the stream duration
      await advanceToMidPhase("active", timeParams);

      // Do a full withdrawal before stream ends. This will leave some outRemaining tokens.
      await contracts.stream.connect(accounts.subscriber1).withdraw(0n);

      // Advance to ended phase - stream ends with remaining output tokens
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Get stream state to check outRemaining
      const streamState = await contracts.stream.getStreamState();
      const outRemaining = streamState.outRemaining;
      // Ensure we actually have outRemaining > 0
      expect(outRemaining).to.be.gt(0);

      // Get balances before finalization
      const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      const receipt = await finalizeTx.wait();

      // Get balances after finalization
      const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceAfter = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Verify remaining output tokens were transferred to creator
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(outRemaining);

      // Verify event shows outRemaining > 0
      const event = receipt?.logs.find(
        (log: any) => log.topics[0] === contracts.stream.interface.getEvent("FinalizedStreamed").topicHash
      );
      expect(event).to.not.be.undefined;
      if (event) {
        const parsedEvent = contracts.stream.interface.parseLog({
          topics: event.topics,
          data: event.data,
        });
        expect(parsedEvent?.args[4]).to.be.gt(0);
        expect(parsedEvent?.args[4]).to.equal(outRemaining);
      }
    });
  });

  describe("Finalize Edge Cases", function () {
    it("Should not allow finalize during waiting period", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      await expect(
        contracts.stream.connect(accounts.creator).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });

    it("Should not allow finalize during bootstrapping period", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build()
      );

      await advanceStreamToPhase(contracts.stream, "bootstrapping", timeParams);

      await expect(
        contracts.stream.connect(accounts.creator).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });

    it("Should not allow finalize during active period", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build()
      );

      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      await expect(
        contracts.stream.connect(accounts.creator).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });

    it("Should not allow non-creator to finalize", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      await expect(
        contracts.stream.connect(accounts.subscriber1).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
    });

    it("Should not allow finalize after already finalized", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Finalize once
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Try to finalize again
      await expect(
        contracts.stream.connect(accounts.creator).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });

    it("Should handle recurring finalize attempts by different users", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // First finalize by creator
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Try to finalize again by different users
      await expect(
        contracts.stream.connect(accounts.subscriber1).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");

      await expect(
        contracts.stream.connect(accounts.subscriber2).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");

      await expect(
        contracts.stream.connect(accounts.protocolAdmin).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");

      // Requiring finalize call by creator
      await expect(
        contracts.stream.connect(accounts.creator).finalizeStream()
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });

    it("Should handle finalize with no subscriptions and zero threshold", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(0n).build()
      );

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check initial balances
      const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceBefore = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceAfter = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Verify balances
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
      expect(streamOutBalanceAfter).to.equal(0n);

      // Verify status
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedStreamed);
    });

    it("Should handle finalize with no subscriptions and non-zero threshold", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().setThreshold(100n).build()
      );

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check initial balances
      const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceBefore = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamOutBalanceAfter = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());

      // Verify balances
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
      expect(streamOutBalanceAfter).to.equal(0n);

      // Verify status
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);
    });
  });

  describe("Native Token Finalization", function () {
    it("Should handle stream finalization with native token", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream().nativeToken().build()
      );

      // Advance to bootstrapping phase and sync
      await advanceStreamToPhase(contracts.stream, "bootstrapping", timeParams);

      // Subscribe with native token
      const subscriptionAmount = Amounts.SMALL_AMOUNT;
      await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithNativeToken(subscriptionAmount, [], { value: subscriptionAmount });

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Check creators native token balance
      const creatorNativeBalanceBefore = await getBalance("native", accounts.creator);

      // Finalize the stream (must be called by creator)
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Check creators native token balance
      const creatorNativeBalanceAfter = await getBalance("native", accounts.creator);
      expect(creatorNativeBalanceAfter).to.be.greaterThan(creatorNativeBalanceBefore);
    });
  });
});
