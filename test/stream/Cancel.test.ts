import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Status, Amounts, Errors } from "../types";
import { advanceStreamToPhase } from "../helpers/stream";
import { getBalance } from "../helpers/balances";

describe("Stream Cancel", function () {
  describe("Normal Cancel", function () {
    it("Creator should be able to cancel stream in WAITING status and receive exact refund", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      // Check initial status is WAITING
      const initialStatus = await contracts.stream.getStreamStatus();
      expect(initialStatus).to.equal(Status.Waiting);

      // Get stream state before cancellation
      const streamState = await contracts.stream.getStreamState();

      const creatorBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);

      // Cancel the stream
      await contracts.stream.connect(accounts.creator).cancelStream();

      // Check status is now CANCELLED
      const finalStatus = await contracts.stream.getStreamStatus();
      expect(finalStatus).to.equal(Status.Cancelled);

      // Verify creator received exact refund amount
      const finalCreatorBalance = await getBalance(contracts.outSupplyToken, accounts.creator);
      expect(finalCreatorBalance).to.equal(creatorBalanceBefore + streamState.outSupply);

      // Verify stream contract has 0 balance
      const streamBalance = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());
      expect(streamBalance).to.equal(0n);
    });

    it("Should not allow creator to cancel if already cancelled", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      // First cancellation
      await contracts.stream.connect(accounts.creator).cancelStream();

      // Second cancellation should fail
      await expect(contracts.stream.connect(accounts.creator).cancelStream()).to.be.revertedWithCustomError(
        contracts.stream,
        Errors.OperationNotAllowed,
      );
    });

    it("Should not allow creator to cancel during bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Move to bootstrapping phase and sync
      await advanceStreamToPhase(contracts.stream, "bootstrapping", timeParams);

      await expect(contracts.stream.connect(accounts.creator).cancelStream()).to.be.revertedWithCustomError(
        contracts.stream,
        Errors.OperationNotAllowed,
      );
    });

    it("Should not allow non-creator to cancel stream", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      await expect(contracts.stream.connect(accounts.subscriber1).cancelStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "Unauthorized",
      );
    });
  });

  describe("Admin Cancel", function () {
    it("Protocol admin should be able to cancel stream in ACTIVE status", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Move to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with some amount
      const subscribeAmount = Amounts.SMALL_AMOUNT;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount, []);

      // Get balances before cancellation
      const creatorBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamStateBefore = await contracts.stream.getStreamState();

      // Cancel with admin
      await contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin();

      // Check final balances
      const creatorBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(streamStateBefore.outSupply);
    });

    it("Should handle cancellation at stream boundaries correctly", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Move to bootstrapping phase and sync
      await advanceStreamToPhase(contracts.stream, "bootstrapping", timeParams);

      await expect(contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin()).to.not.be.reverted;
    });

    it("Should fail admin cancel if caller is not protocol admin", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      // Try cancelling with different non-admin accounts
      for (const account of [accounts.subscriber1, accounts.subscriber2]) {
        await expect(contracts.stream.connect(account).cancelWithAdmin()).to.be.revertedWithCustomError(
          contracts.stream,
          "Unauthorized",
        );
      }
    });

    it("Should not allow admin cancel after stream is ended", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Move to ended status and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      await expect(contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin()).to.be.revertedWithCustomError(
        contracts.stream,
        Errors.OperationNotAllowed,
      );
    });

    it("Should not allow admin cancel after stream is finalized", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Move to ended status and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Finalize the stream
      await contracts.stream.connect(accounts.creator).finalizeStream();

      await expect(contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin()).to.be.revertedWithCustomError(
        contracts.stream,
        Errors.OperationNotAllowed,
      );
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
          Status.Cancelled,
        );
    });

    it("Should refund all tokens when admin cancels with multiple subscribers", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Move to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Multiple subscribers subscribe
      const subscribeAmount = Amounts.SMALL_AMOUNT;
      for (const subscriber of [accounts.subscriber1, accounts.subscriber2]) {
        await contracts.inSupplyToken.connect(subscriber).approve(contracts.stream.getAddress(), subscribeAmount);
        await contracts.stream.connect(subscriber).subscribe(subscribeAmount, []);
      }

      const creatorBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);
      const streamStateBefore = await contracts.stream.getStreamState();

      // Cancel with admin
      await contracts.stream.connect(accounts.protocolAdmin).cancelWithAdmin();

      // Verify all out tokens returned to creator
      const creatorBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(streamStateBefore.outSupply);

      // Verify stream contract has 0 balance
      const streamBalance = await getBalance(contracts.outSupplyToken, await contracts.stream.getAddress());
      expect(streamBalance).to.equal(0n);
    });
  });
});
