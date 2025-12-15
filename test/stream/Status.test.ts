import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Status } from "../types";
import { advanceToPhase, timeTravel } from "../helpers/time";
import { advanceStreamToPhase } from "../helpers/stream";

describe("Stream Status", function () {
  it("Should have start with status WAITING", async function () {
    const { contracts } = await loadFixture(stream().build());
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.Waiting);
  });

  it("Should transition to bootstrapping phase", async function () {
    const { contracts, timeParams } = await loadFixture(stream().build());

    // Advance to bootstrapping phase and sync
    await advanceStreamToPhase(contracts.stream, "bootstrapping", timeParams);

    // Check status
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.Bootstrapping);
  });

  it("Should transition to stream phase", async function () {
    const { contracts, timeParams } = await loadFixture(stream().build());

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Check status
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.Active);
  });

  it("Should transition to ended phase", async function () {
    const { contracts, timeParams } = await loadFixture(stream().build());

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    // Check status
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.Ended);
  });

  it("Should handle sync when diff is 0", async function () {
    const { contracts, timeParams } = await loadFixture(stream().build());

    // Advance to just before stream start
    await timeTravel(timeParams.streamStartTime - 1);

    // Sync the stream
    await contracts.stream.syncStreamExternal();

    // Sync again immediately - should handle diff = 0 case
    await contracts.stream.syncStreamExternal();

    // Verify sync was successful
    const status = await contracts.stream.getStreamStatus();
    expect(status).to.equal(Status.Active);
  });
});
