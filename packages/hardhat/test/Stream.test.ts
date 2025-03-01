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

    // Add more tests using the builder pattern...
}); 