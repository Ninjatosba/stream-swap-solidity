import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "./helpers/StreamFixtureBuilder";

describe("Stream Status", function () {
    // Basic test with default parameters
    it("Should have start with status WAITING", async function () {
        const { contracts } = await loadFixture(stream().build());
        const status = await contracts.stream.getStreamStatus();
        expect(status).to.equal(0);
    });

    it("Should transition to bootstrapping phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to bootstrapping start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(1); // Bootstrapping phase
    });

    it("Should transition to stream phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(2); // Stream phase (Active)
    });

    it("Should transition to ended phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to stream end
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Check status
        const status = await contracts.stream.streamStatus();
        expect(status).to.equal(3); // Ended phase
    });
    it("Should handle sync when diff is 0", async function () {
        const { contracts, timeParams, accounts } = await loadFixture(stream().build());

        // Fast forward time to stream start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime - 1]);
        await ethers.provider.send("evm_mine", []);

        // Sync the stream
        const tx = await contracts.stream.syncStreamExternal();
        await tx.wait();

        // Sync again immediately - should handle diff = 0 case
        const tx2 = await contracts.stream.syncStreamExternal();
        await tx2.wait();

        // Verify sync was successful
        const status = await contracts.stream.getStreamStatus();
        expect(status).to.equal(2); // Active
    });
}); 