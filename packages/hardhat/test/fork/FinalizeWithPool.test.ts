import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Amounts } from "../types";
import { advanceStreamToPhase, subscribeAndSync } from "../helpers/stream";
import { getBalance } from "../helpers/balances";
import { getPoolCreatedEvent, getFinalizedStreamedEvent } from "../helpers/events";

describe("Finalize with Pool Creation (fork)", function () {
  after(async function () {
    // Reset network back to local (non-fork) mode
    await ethers.provider.send("hardhat_reset", [{}]);
  });

  it("should store pool configuration during stream creation", async function () {
    const poolOutSupplyAmount = ethers.parseEther("1000");
    const streamOutAmount = ethers.parseEther("10000");
    const { contracts } = await loadFixture(
      stream()
        .streamOut(streamOutAmount)
        .poolOutSupply(poolOutSupplyAmount)
        .enablePoolCreation(true)
        .dex("v2")
        .build()
    );

    // Query post stream actions - verify pool config is stored
    const state = await contracts.stream.getPostStreamActions();
    expect(state.poolInfo.poolOutSupplyAmount).to.equal(poolOutSupplyAmount);
  });

  it("Should handle finalize with Pool V2 creation", async function () {
    const poolOutAmount = ethers.parseEther("25");
    const { contracts, timeParams, accounts } = await loadFixture(
      stream()
        .poolOutSupply(poolOutAmount)
        .streamOut(Amounts.DEFAULT_THRESHOLD)
        .setThreshold(Amounts.DEFAULT_THRESHOLD)
        .enablePoolCreation(true)
        .dex("v2")
        .build()
    );

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Subscribe to reach threshold
    await subscribeAndSync(contracts.stream, accounts.subscriber1, Amounts.DEFAULT_THRESHOLD, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    const creatorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.creator);
    const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Finalize with pool creation
    const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
    const receipt = await finalizeTx.wait();

    const streamAddress = await contracts.stream.getAddress();
    const finalizedEvent = await getFinalizedStreamedEvent(receipt!, streamAddress);
    const poolEvent = await getPoolCreatedEvent(receipt!, streamAddress);

    // Verify events
    expect(finalizedEvent).to.not.be.null;
    expect(poolEvent).to.not.be.null;
    expect(poolEvent!.streamAddress).to.equal(streamAddress);
    expect(poolEvent!.poolAddress).to.not.equal(ethers.ZeroAddress);

    const creatorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.creator);
    const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Verify balances (refundedAmount0 = out token refund, refundedAmount1 = in token refund)
    expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(poolEvent!.refundedAmount1 + finalizedEvent!.creatorRevenue);
    expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(poolEvent!.refundedAmount0);

    // Get price from the V2 pool
    const pool = await ethers.getContractAt("IUniswapV2Pair", poolEvent!.poolAddress);
    const reserves = await pool.getReserves();
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    const outToken = await contracts.outSupplyToken.getAddress();
    const inToken = await contracts.inSupplyToken.getAddress();

    // Calculate price as OUT per IN, adjusting for token ordering in the pair
    let price: number;
    if (token0 === outToken && token1 === inToken) {
      price = Number(reserves.reserve0) / Number(reserves.reserve1);
    } else if (token0 === inToken && token1 === outToken) {
      price = Number(reserves.reserve1) / Number(reserves.reserve0);
    } else {
      throw new Error("Unexpected token ordering in V2 pair");
    }

    expect(price).to.be.closeTo(1.111, 0.001);
  });

  it("Should handle finalize with Pool V3 creation", async function () {
    const { contracts, timeParams, accounts } = await loadFixture(
      stream()
        .poolOutSupply(ethers.parseEther("25"))
        .streamOut(Amounts.DEFAULT_THRESHOLD)
        .setThreshold(Amounts.DEFAULT_THRESHOLD)
        .enablePoolCreation(true)
        .dex("v3")
        .build()
    );

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Subscribe to reach threshold
    await subscribeAndSync(contracts.stream, accounts.subscriber1, Amounts.DEFAULT_THRESHOLD, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    const creatorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.creator);
    const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Finalize with pool creation
    const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
    const receipt = await finalizeTx.wait();

    const streamAddress = await contracts.stream.getAddress();
    const finalizedEvent = await getFinalizedStreamedEvent(receipt!, streamAddress);
    const poolEvent = await getPoolCreatedEvent(receipt!, streamAddress);

    // Verify events
    expect(finalizedEvent).to.not.be.null;
    expect(poolEvent).to.not.be.null;
    expect(poolEvent!.streamAddress).to.equal(streamAddress);
    expect(poolEvent!.poolAddress).to.not.equal(ethers.ZeroAddress);

    const creatorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.creator);
    const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Verify balances
    expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(poolEvent!.refundedAmount1 + finalizedEvent!.creatorRevenue);
    expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(poolEvent!.refundedAmount0);

    // Get price from the v3 pool
    const pool = await ethers.getContractAt("IUniswapV3Pool", poolEvent!.poolAddress);
    const { token0, token1 } = poolEvent!;
    const outToken = await contracts.outSupplyToken.getAddress();
    const inToken = await contracts.inSupplyToken.getAddress();
    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0.sqrtPriceX96;

    // priceToken1PerToken0 = (token1/token0)
    const priceToken1PerToken0 = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
    let priceOutPerIn: number;
    if (token0 === outToken && token1 === inToken) {
      // priceToken1PerToken0 = in/out -> invert to get out per in
      priceOutPerIn = priceToken1PerToken0;
    } else if (token0 === inToken && token1 === outToken) {
      // priceToken1PerToken0 = out/in -> invert
      priceOutPerIn = 1 / priceToken1PerToken0;
    } else {
      throw new Error("Unexpected token ordering in V3 pool");
    }

    expect(priceOutPerIn).to.be.closeTo(1.111, 0.001);
  });

  it("Should handle finalize with Pool Aerodrome creation", async function () {
    const { contracts, timeParams, accounts } = await loadFixture(
      stream()
        .poolOutSupply(ethers.parseEther("25"))
        .streamOut(Amounts.DEFAULT_THRESHOLD)
        .setThreshold(Amounts.DEFAULT_THRESHOLD)
        .enablePoolCreation(true)
        .forkDetails(undefined, "baseAerodrome")
        .build()
    );

    // Advance to active phase and sync
    await advanceStreamToPhase(contracts.stream, "active", timeParams);

    // Subscribe to reach threshold
    await subscribeAndSync(contracts.stream, accounts.subscriber1, Amounts.DEFAULT_THRESHOLD, contracts.inSupplyToken);

    // Advance to ended phase and sync
    await advanceStreamToPhase(contracts.stream, "ended", timeParams);

    const creatorInBalanceBefore = await getBalance(contracts.inSupplyToken, accounts.creator);
    const creatorOutBalanceBefore = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Finalize with pool creation
    const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
    const receipt = await finalizeTx.wait();

    const streamAddress = await contracts.stream.getAddress();
    const finalizedEvent = await getFinalizedStreamedEvent(receipt!, streamAddress);
    const poolEvent = await getPoolCreatedEvent(receipt!, streamAddress);

    // Verify events
    expect(finalizedEvent).to.not.be.null;
    expect(poolEvent).to.not.be.null;
    expect(poolEvent!.streamAddress).to.equal(streamAddress);
    expect(poolEvent!.poolAddress).to.not.equal(ethers.ZeroAddress);

    const creatorInBalanceAfter = await getBalance(contracts.inSupplyToken, accounts.creator);
    const creatorOutBalanceAfter = await getBalance(contracts.outSupplyToken, accounts.creator);

    // Verify balances (Aerodrome has different token ordering)
    expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(poolEvent!.refundedAmount0 + finalizedEvent!.creatorRevenue);
    expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(poolEvent!.refundedAmount1);

    // Get price from the Aerodrome pool
    const pool = await ethers.getContractAt("IAerodromePool", poolEvent!.poolAddress);
    const reserves = await pool.getReserves();
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    const outToken = await contracts.outSupplyToken.getAddress();
    const inToken = await contracts.inSupplyToken.getAddress();

    let price: number;
    if (token0 === outToken && token1 === inToken) {
      price = Number(reserves[0]) / Number(reserves[1]);
    } else if (token0 === inToken && token1 === outToken) {
      price = Number(reserves[1]) / Number(reserves[0]);
    } else {
      throw new Error("Unexpected token ordering in Aerodrome pool");
    }

    expect(price).to.be.closeTo(1.111, 0.001);
  });
});
