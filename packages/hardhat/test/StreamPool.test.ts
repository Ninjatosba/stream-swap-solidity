import { expect } from "chai";
import { ethers } from "hardhat";
import { stream } from "./helpers/StreamFixtureBuilder";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Stream Pool Creation", function () {
  let poolOutSupplyAmount: bigint;
  let streamOutAmount: bigint;

  it("should store pool configuration during stream creation", async function () {
    poolOutSupplyAmount = ethers.parseEther("1000");
    streamOutAmount = ethers.parseEther("10000");
    const { contracts, timeParams, accounts } = await loadFixture(
      stream().streamOut(streamOutAmount).poolOutSupply(poolOutSupplyAmount).enablePoolCreation(true).build(),
    );

    const streamContract = contracts.stream;
    // Query post stream actions
    const state = await streamContract.postStreamActions();
    expect(state.poolInfo.poolOutSupplyAmount).to.equal(poolOutSupplyAmount);
  });

  it("should create pool and transfer tokens when stream is finalized", async function () {
    const { contracts, timeParams, accounts, config } = await loadFixture(
      stream()
        .streamOut(streamOutAmount)
        .poolOutSupply(poolOutSupplyAmount)
        .setThreshold(ethers.parseEther("100"))
        .enablePoolCreation(true)
        .build(),
    );

    // Fast forward time to started phase
    await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // Subscribe to reach threshold
    const threshold = await config.threshold;
    await contracts.inSupplyToken.connect(accounts.subscriber1).approve(await contracts.stream.getAddress(), threshold);
    await contracts.stream.connect(accounts.subscriber1).subscribe(threshold);

    // Fast forward time to ended phase
    await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // Finalize the stream
    const tx = await contracts.stream.connect(accounts.creator).finalizeStream();
    await tx.wait();

    // Get pool creation event
    const receipt = await tx.wait();
    const poolWrapperIface = new ethers.Interface([
      "event PoolCreated(address indexed stream, address indexed pool, address indexed poolWrapper, address token0, address token1, uint256 token0Amount, uint256 token1Amount)",
    ]);
    const poolCreatedTopic = ethers.id("PoolCreated(address,address,address,address,address,uint256,uint256)");
    const poolCreatedEvent = receipt?.logs.find((log: any) => log.topics[0] === poolCreatedTopic);
    expect(poolCreatedEvent).to.not.be.undefined;

    // Parse the event
    const parsedEvent = poolWrapperIface.parseLog({
      topics: poolCreatedEvent!.topics,
      data: poolCreatedEvent!.data,
    });
    expect(parsedEvent?.name).to.equal("PoolCreated");
    expect(parsedEvent?.args.stream).to.equal(await contracts.stream.getAddress());
    expect(parsedEvent?.args.token0).to.equal(await contracts.inSupplyToken.getAddress());
    expect(parsedEvent?.args.token1).to.equal(await contracts.outSupplyToken.getAddress());

    // Check pool contracts in token balances
    // Token balances are held by the pool address, not the wrapper
    const poolAddress = parsedEvent?.args.pool;
    const inSupplyTokenBalance = await contracts.inSupplyToken.balanceOf(poolAddress);
    const outSupplyTokenBalance = await contracts.outSupplyToken.balanceOf(poolAddress);
    expect(inSupplyTokenBalance).to.equal(parsedEvent?.args.token0Amount);
    expect(outSupplyTokenBalance).to.equal(parsedEvent?.args.token1Amount);
  });
});
