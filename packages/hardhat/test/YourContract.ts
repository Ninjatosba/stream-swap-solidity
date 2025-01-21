import { expect } from "chai";
import { ethers } from "hardhat";
import { Stream } from "../typechain-types";

describe("Stream", function () {
  // We define a fixture to reuse the same setup in every test.

  let stream: Stream;
  before(async () => {
    const [owner] = await ethers.getSigners();
  });
});
