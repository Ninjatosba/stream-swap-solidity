import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Status, Amounts, Durations } from "../types";
import { advanceStreamToPhase, subscribeAndSync } from "../helpers/stream";
import { getVestingWalletCreatedEvent } from "../helpers/events";

describe("Finalize with Vesting", function () {
  it("Should handle finalize with creator vesting enabled", async function () {
    const { contracts, timeParams, accounts } = await loadFixture(
      stream()
        .creatorVesting(Durations.ONE_HOUR)
        .setThreshold(Amounts.DEFAULT_THRESHOLD)
        .build()
    );

    // Validate that vesting is properly configured
    const streamState = await contracts.stream.getStreamState();
    expect(streamState).to.not.be.undefined;

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Subscribe to reach threshold
    await subscribeAndSync(contracts.stream, accounts.subscriber1, Amounts.DEFAULT_THRESHOLD, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    // Get factory params to access vesting factory address
    const factoryParams = await (contracts.streamFactory as any).getParams();
    expect(factoryParams.vestingFactoryAddress).to.not.equal(ethers.ZeroAddress);

    // Finalize with creator vesting enabled
    const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
    const receipt = await finalizeTx.wait();

    // Get vesting event using helper
    const vestingEvent = await getVestingWalletCreatedEvent(receipt!, factoryParams.vestingFactoryAddress);

    // Verify vesting event
    expect(vestingEvent).to.not.be.null;
    expect(vestingEvent!.beneficiary).to.equal(accounts.creator.address);
    expect(vestingEvent!.startTime).to.be.gt(0);
    expect(vestingEvent!.duration).to.equal(BigInt(Durations.ONE_HOUR));
    expect(vestingEvent!.token).to.equal(await contracts.inSupplyToken.getAddress());
    expect(vestingEvent!.amount).to.be.gt(0);

    // Verify vesting wallet was created
    expect(vestingEvent!.vestingWallet).to.not.equal(ethers.ZeroAddress);

    // Check vesting wallet balance
    const vestingWalletBalance = await contracts.inSupplyToken.balanceOf(vestingEvent!.vestingWallet);
    expect(vestingWalletBalance).to.be.gt(0);

    // Verify finalization was successful
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.FinalizedStreamed);
  });

  it("Should handle finalize with creator vesting and pool out supply", async function () {
    const poolOutAmount = ethers.parseEther("25");
    const { contracts, timeParams, accounts } = await loadFixture(
      stream()
        .creatorVesting(Durations.ONE_HOUR)
        .poolOutSupply(poolOutAmount)
        .setThreshold(Amounts.DEFAULT_THRESHOLD)
        .build()
    );

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Subscribe to reach threshold
    await subscribeAndSync(contracts.stream, accounts.subscriber1, Amounts.DEFAULT_THRESHOLD, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    // Finalize with vesting
    const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
    const receipt = await finalizeTx.wait();

    // Get factory params to access vesting factory address
    const factoryParams = await (contracts.streamFactory as any).getParams();
    expect(factoryParams.vestingFactoryAddress).to.not.equal(ethers.ZeroAddress);

    // Get vesting event using helper
    const vestingEvent = await getVestingWalletCreatedEvent(receipt!, factoryParams.vestingFactoryAddress);

    // Verify vesting event
    expect(vestingEvent).to.not.be.null;
    expect(vestingEvent!.beneficiary).to.equal(accounts.creator.address);
    expect(vestingEvent!.startTime).to.be.gt(0);
    expect(vestingEvent!.duration).to.equal(BigInt(Durations.ONE_HOUR));
    expect(vestingEvent!.token).to.equal(await contracts.inSupplyToken.getAddress());
    expect(vestingEvent!.amount).to.be.gt(0);

    // Verify vesting wallet was created
    expect(vestingEvent!.vestingWallet).to.not.equal(ethers.ZeroAddress);

    // Check vesting wallet balance
    const vestingWalletBalance = await contracts.inSupplyToken.balanceOf(vestingEvent!.vestingWallet);
    expect(vestingWalletBalance).to.be.gt(0);

    // Verify finalization was successful
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.FinalizedStreamed);
  });
});

