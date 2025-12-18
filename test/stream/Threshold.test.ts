import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Status, Amounts } from "../types";
import { advanceStreamToPhase, subscribeAndSync } from "../helpers/stream";
import { getBalance } from "../helpers/balances";

describe("Stream Threshold", function () {
  it("Should refund to creator if threshold is not reached", async function () {
    const { contracts, timeParams, accounts, config } = await loadFixture(
      stream().setThreshold(Amounts.DEFAULT_THRESHOLD).build(),
    );

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    // Check status
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.Ended);

    // When finalized out tokens should be refunded - check current balance of the creator
    const creatorBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Finalize the stream
    await contracts.stream.connect(accounts.creator).finalizeStream();

    // Check balance of the creator
    const creatorBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);
    expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + BigInt(config.streamOutAmount));
  });

  it("Should refund to subscribers if threshold is not reached", async function () {
    const threshold = Amounts.DEFAULT_THRESHOLD;
    const { contracts, timeParams, accounts } = await loadFixture(
      stream().setThreshold(threshold).build()
    );

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Check status
    expect(await contracts.stream.getStreamStatus()).to.equal(Status.Active);

    // Subscribe with amounts less than threshold
    const subscribeAmount = threshold / 2n - 1n;
    await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);
    await subscribeAndSync(contracts.stream, accounts.subscriber2, subscribeAmount, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    // Check status
    expect(await contracts.stream.getStreamStatus()).to.equal(Status.Ended);

    // Check in supply token balance of subscriber1
    const subscriber1InSupplyTokenBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.subscriber1);

    // Subscriber one exits at status ended
    await contracts.stream.connect(accounts.subscriber1).exitStream();

    // Check in supply token balance of subscriber1
    const subscriber1InSupplyTokenBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.subscriber1);
    expect(subscriber1InSupplyTokenBalanceAfter).to.equal(subscriber1InSupplyTokenBalanceBefore + subscribeAmount);

    // Creator finalizes the stream
    await contracts.stream.connect(accounts.creator).finalizeStream();

    // Check in supply token balance of subscriber2
    const subscriber2InSupplyTokenBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.subscriber2);

    // Subscriber two exits at status finalized::refunded
    await contracts.stream.connect(accounts.subscriber2).exitStream();

    // Check in supply token balance of subscriber2
    const subscriber2InSupplyTokenBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.subscriber2);
    expect(subscriber2InSupplyTokenBalanceAfter).to.equal(subscriber2InSupplyTokenBalanceBefore + subscribeAmount);

    // After this stream contracts wallet should have 0 balance
    const streamContractInSupplyTokenBalance = await getBalance(
      contracts.inSupplyToken,
      await contracts.stream.getAddress()
    );
    expect(streamContractInSupplyTokenBalance).to.equal(0n);

    const streamContractOutSupplyTokenBalance = await getBalance(
      contracts.outSupplyToken,
      await contracts.stream.getAddress()
    );
    expect(streamContractOutSupplyTokenBalance).to.equal(0n);
  });

  it("Should finalize normally if threshold is reached", async function () {
    const threshold = Amounts.DEFAULT_THRESHOLD;
    const { contracts, timeParams, accounts, config, factoryParams } = await loadFixture(
      stream().setThreshold(threshold).build(),
    );

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Subscribe with the subscriber1
    await subscribeAndSync(contracts.stream, accounts.subscriber1, threshold, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    // Threshold is reached - when subscriber1 exits at status ended should acquire out tokens
    const subscriber1OutSupplyTokenBalanceBefore = Number(
      await getBalance(contracts.outSupplyToken, accounts.subscriber1)
    );

    // Exit the stream
    await contracts.stream.connect(accounts.subscriber1).exitStream();

    // Check balance of the subscriber1
    const subscriber1OutSupplyTokenBalanceAfter = Number(
      await getBalance(contracts.outSupplyToken, accounts.subscriber1)
    );
    expect(subscriber1OutSupplyTokenBalanceAfter).to.equal(
      subscriber1OutSupplyTokenBalanceBefore + Number(config.streamOutAmount),
    );

    // Finalize the stream
    const creatorInSupplyTokenBalanceBefore = Number(await getBalance(contracts.inSupplyToken, accounts.creator));

    await contracts.stream.connect(accounts.creator).finalizeStream();

    // Check balance of the creator
    const creatorInSupplyTokenBalanceAfter = Number(await getBalance(contracts.inSupplyToken, accounts.creator));
    const exitFeeRatio = Number(factoryParams.exitFeeRatio.value);
    const ratio = exitFeeRatio / 1000000;
    const expectedBalance = creatorInSupplyTokenBalanceBefore + Number(threshold) - Number(threshold) * ratio;
    expect(creatorInSupplyTokenBalanceAfter).to.equal(expectedBalance);
  });
});
