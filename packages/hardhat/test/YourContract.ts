import { expect } from "chai";
import { ethers } from "hardhat";
import { StreamFactory } from "../typechain-types";

describe("StreamFactory", function () {
  let streamFactory: StreamFactory;
  let owner: any;

  before(async () => {
    [owner] = await ethers.getSigners();

    const StreamFactory = await ethers.getContractFactory("StreamFactory");
    streamFactory = await StreamFactory.deploy(
      100, // _streamCreationFee
      owner.address, // _streamCreationFeeToken
      5, // _exitFeePercent
      60, // _minWaitingDuration
      120, // _minBootstrappingDuration
      300, // _minStreamDuration
      [owner.address], // _acceptedTokens
      owner.address, // _feeCollector
      owner.address, // _protocolAdmin
      "1.0" // _tosVersion
    );
    await streamFactory.deployed();
  });

  it("should have correct initial parameters", async function () {
    const params = await streamFactory.params();
    expect(params.streamCreationFee).to.equal(100);
    expect(params.streamCreationFeeToken).to.equal(owner.address);
    expect(params.exitFeePercent).to.equal(5);
    expect(params.minWaitingDuration).to.equal(60);
    expect(params.minBootstrappingDuration).to.equal(120);
    expect(params.minStreamDuration).to.equal(300);
    expect(params.feeCollector).to.equal(owner.address);
    expect(params.protocolAdmin).to.equal(owner.address);
    expect(params.tosVersion).to.equal("1.0");
  });
});
