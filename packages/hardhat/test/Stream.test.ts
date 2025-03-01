import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Stream, StreamFactory, ERC20Mock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";
import { stream, StreamFixtureBuilder } from "./helpers/StreamFixtureBuilder";

describe("Stream Contract", function () {
    // Basic test with default parameters
    it("Should have start with status WAITING", async function () {
        const { contracts } = await loadFixture(stream().build());
        let status = await contracts.stream.streamStatus();
        expect(status.mainStatus).to.equal(0);
    });

    it("Should transition to bootstrapping phase", async function () {
        const { contracts, timeParams } = await loadFixture(stream().build());

        // Fast forward time to bootstrapping start
        await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
        await ethers.provider.send("evm_mine", []);


        // Sync the stream
        await contracts.stream.syncStreamExternal();

        // get current time
        let currentTime = await ethers.provider.getBlock("latest");
        console.log(currentTime?.timestamp);

        // Check status
        const status = await contracts.stream.streamStatus();
        console.log(status);
        expect(status.mainStatus).to.equal(1); // Bootstrapping phase
    });
    // Add more tests using the builder pattern...
}); 