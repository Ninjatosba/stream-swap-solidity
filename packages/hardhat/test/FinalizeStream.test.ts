import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "./helpers/StreamFixtureBuilder";
// typechain import for StreamFactory types is optional; we avoid it to prevent compile/type drift during refactors

enum Status {
  Waiting,
  Bootstrapping,
  Active,
  Ended,
  FinalizedRefunded,
  FinalizedStreamed,
  Cancelled,
}

describe("Stream Finalize", function () {
  after(async function () {
    // Reset network back to local (non-fork) mode
    await ethers.provider.send("hardhat_reset", [{}]);
  });

  describe("Finalize with Threshold Reached", function () {
    it("Should finalize stream and collect fees when threshold is reached", async function () {
      const exitFeeRatio = 20000;
      const { contracts, timeParams, accounts, factoryParams } = await loadFixture(
        stream().exitRatio(exitFeeRatio).setThreshold(ethers.parseEther("100")).build(),
      );

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Subscribe to the stream with amount above threshold
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount = threshold * BigInt(2);
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Check initial balances
      const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const feeCollectorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const feeCollectorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);
      const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());
      // Calculate expected fees and revenue
      const fee = (subscribeAmount * BigInt(exitFeeRatio)) / BigInt(1e6);
      const expectedCreatorRevenue = subscribeAmount - fee;

      // Verify balances
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(expectedCreatorRevenue);
      expect(feeCollectorInBalanceAfter - feeCollectorInBalanceBefore).to.equal(fee);
      expect(streamInBalanceAfter).to.equal(0); // Stream should have no remaining balance

      // Verify event emission
      await expect(finalizeTx)
        .to.emit(contracts.stream, "FinalizedStreamed")
        .withArgs(contracts.stream.getAddress(), accounts.creator.address, expectedCreatorRevenue, fee, 0n);
    });

    it("Should handle finalize with creator vesting enabled", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream()
          .creatorVesting(3600) // 1 hour vesting
          .setThreshold(ethers.parseEther("100"))
          .build()
      );

      // Validate that vesting is properly configured
      const streamState = await contracts.stream.getStreamState();
      expect(streamState).to.not.be.undefined;

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx = await contracts.stream.syncStreamExternal();
      await tx.wait();

      // Subscribe to reach threshold
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx2 = await contracts.stream.syncStreamExternal();
      await tx2.wait();

      // Get factory params to access vesting factory address
      const factoryParams = await (contracts.streamFactory as any).getParams();
      expect(factoryParams.vestingFactoryAddress).to.not.be.equal(ethers.ZeroAddress);

      // Finalize with creator vesting enabled
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      const receipt = await finalizeTx.wait();

      // Query logs from VestingFactory contract for VestingWalletCreated event
      const vestingFactoryInterface = new ethers.Interface([
        "event VestingWalletCreated(address indexed beneficiary, address indexed vestingWallet, uint64 startTime, uint64 duration, address token, uint256 amount)"
      ]);

      // Get logs from VestingFactory contract
      const vestingEventTopic = ethers.id("VestingWalletCreated(address,address,uint64,uint64,address,uint256)");
      const vestingLogs = await ethers.provider.getLogs({
        address: factoryParams.vestingFactoryAddress,
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [vestingEventTopic]
      });

      // Should have one VestingWalletCreated event
      expect(vestingLogs.length).to.equal(1);

      // Parse the vesting event
      const vestingEvent = vestingFactoryInterface.parseLog(vestingLogs[0]);
      expect(vestingEvent?.args?.beneficiary).to.equal(accounts.creator.address);
      expect(vestingEvent?.args?.startTime).to.be.gt(0);
      expect(vestingEvent?.args?.duration).to.equal(3600); // 1 hour
      expect(vestingEvent?.args?.token).to.equal(await contracts.inSupplyToken.getAddress());
      expect(vestingEvent?.args?.amount).to.be.gt(0);

      // Get vesting wallet address
      const vestingWalletAddress = vestingEvent?.args?.vestingWallet;
      expect(vestingWalletAddress).to.not.be.equal(ethers.ZeroAddress);

      // Check vesting wallet balance
      const vestingWalletBalance = await contracts.inSupplyToken.balanceOf(vestingWalletAddress);
      expect(vestingWalletBalance).to.be.gt(0);

      // Verify finalization was successful
      const status = await contracts.stream.getStreamStatus();
      expect(status).to.equal(5); // FinalizedStreamed
    });

    it("Should handle multiple subscriptions before finalization", async function () {
      const exitFeeRatio = 20000;
      const { contracts, timeParams, accounts, config, factoryParams } = await loadFixture(
        stream().exitRatio(exitFeeRatio).setThreshold(ethers.parseEther("100")).build(),
      );

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // First subscription
      const threshold = (await contracts.stream.getStreamState()).threshold;
      const subscribeAmount1 = threshold / 2n;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscribeAmount1);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscribeAmount1);

      // Second subscription
      const subscribeAmount2 = threshold;
      await contracts.inSupplyToken
        .connect(accounts.subscriber2)
        .approve(contracts.stream.getAddress(), subscribeAmount2);
      await contracts.stream.connect(accounts.subscriber2).subscribe(subscribeAmount2);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Check initial balances
      const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const feeCollectorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const feeCollectorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.feeCollector.address);
      const streamInBalanceAfter = await contracts.inSupplyToken.balanceOf(contracts.stream.getAddress());

      const totalSubscribed = subscribeAmount1 + subscribeAmount2;
      const fee = (totalSubscribed * BigInt(exitFeeRatio)) / BigInt(1e6);
      const expectedCreatorRevenue = totalSubscribed - fee;

      // Verify balances
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(expectedCreatorRevenue);
      expect(feeCollectorInBalanceAfter - feeCollectorInBalanceBefore).to.equal(fee);
      expect(streamInBalanceAfter).to.equal(0); // Stream should have no remaining balance

      // Verify event emission
      await expect(finalizeTx)
        .to.emit(contracts.stream, "FinalizedStreamed")
        .withArgs(contracts.stream.getAddress(), accounts.creator.address, expectedCreatorRevenue, fee, 0n);
    });

    it("Should handle finalize with creator vesting", async function () {
      const poolOutAmount = ethers.parseEther("25");
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .creatorVesting(3600)
          .poolOutSupply(poolOutAmount)
          .setThreshold(ethers.parseEther("100"))
          .build()
      );

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx = await contracts.stream.syncStreamExternal();
      await tx.wait();

      // Subscribe to reach threshold
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx2 = await contracts.stream.syncStreamExternal();
      await tx2.wait();

      // Finalize with vesting
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      const receipt = await finalizeTx.wait();

      // Get factory params to access vesting factory address
      const factoryParams = await (contracts.streamFactory as any).getParams();
      expect(factoryParams.vestingFactoryAddress).to.not.be.equal(ethers.ZeroAddress);

      // Query logs from VestingFactory contract for VestingWalletCreated event
      const vestingFactoryInterface = new ethers.Interface([
        "event VestingWalletCreated(address indexed beneficiary, address indexed vestingWallet, uint64 startTime, uint64 duration, address token, uint256 amount)"
      ]);

      // Get logs from VestingFactory contract
      const vestingEventTopic = ethers.id("VestingWalletCreated(address,address,uint64,uint64,address,uint256)");
      const vestingLogs = await ethers.provider.getLogs({
        address: factoryParams.vestingFactoryAddress,
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [vestingEventTopic]
      });

      // Should have one VestingWalletCreated event
      expect(vestingLogs.length).to.equal(1);

      // Parse the vesting event
      const vestingEvent = vestingFactoryInterface.parseLog(vestingLogs[0]);
      expect(vestingEvent?.args?.beneficiary).to.equal(accounts.creator.address);
      expect(vestingEvent?.args?.startTime).to.be.gt(0);
      expect(vestingEvent?.args?.duration).to.equal(3600); // 1 hour
      expect(vestingEvent?.args?.token).to.equal(await contracts.inSupplyToken.getAddress());
      expect(vestingEvent?.args?.amount).to.be.gt(0);

      // Get vesting wallet address
      const vestingWalletAddress = vestingEvent?.args?.vestingWallet;
      expect(vestingWalletAddress).to.not.be.equal(ethers.ZeroAddress);

      // Check vesting wallet balance
      const vestingWalletBalance = await contracts.inSupplyToken.balanceOf(vestingWalletAddress);
      expect(vestingWalletBalance).to.be.gt(0);

      // Verify finalization was successful
      const status = await contracts.stream.getStreamStatus();
      expect(status).to.equal(5); // FinalizedStreamed
    });

    it("Should handle finalize with Pool V2 creation", async function () {
      const poolOutAmount = ethers.parseEther("25");
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .poolOutSupply(poolOutAmount)
          .streamOut(ethers.parseEther("100"))
          .setThreshold(ethers.parseEther("100"))
          .enablePoolCreation(true)
          .dex("v2")
          .build()
      );
      let exitFeeRatio = await (contracts.streamFactory as any).getParams().then((params: any) => params.exitFeeRatio);

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx = await contracts.stream.syncStreamExternal();
      await tx.wait();

      // Subscribe to reach threshold
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx2 = await contracts.stream.syncStreamExternal();
      await tx2.wait();

      const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

      // Finalize with pool creation
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      const receipt = await finalizeTx.wait();

      // Query logs from Stream contract for PoolCreated event
      const streamPoolCreatedInterface = new ethers.Interface([
        "event PoolCreated(address indexed streamAddress, address indexed poolAddress, address token0, address token1, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1, address indexed creator)"
      ]);

      const streamFinalizedInterface = new ethers.Interface([
        "event FinalizedStreamed(address indexed streamAddress, address indexed creator, uint256 creatorRevenue, uint256 exitFeeAmount, uint256 refundedOutAmount)"
      ]);

      // Get logs from Stream contract for FinalizedStreamed event
      const streamFinalizedTopic = ethers.id("FinalizedStreamed(address,address,uint256,uint256,uint256)");
      const streamFinalizedLogs = await ethers.provider.getLogs({
        address: await contracts.stream.getAddress(),
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [streamFinalizedTopic]
      });

      // Should have one FinalizedStreamed event
      expect(streamFinalizedLogs.length).to.equal(1);

      // Parse the finalized event
      const finalizedEvent = streamFinalizedInterface.parseLog(streamFinalizedLogs[0]);
      const creatorRevenue = finalizedEvent?.args?.creatorRevenue;

      // Get logs from Stream contract
      const poolEventTopic = ethers.id("PoolCreated(address,address,address,address,uint256,uint256,uint256,uint256,address)");
      const streamAddress = await contracts.stream.getAddress();
      const poolLogs = await ethers.provider.getLogs({
        address: streamAddress,
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [poolEventTopic]
      });

      // Should have one PoolCreated event
      expect(poolLogs.length).to.equal(1);

      // Parse the pool event
      const poolEvent = streamPoolCreatedInterface.parseLog(poolLogs[0]);
      expect(poolEvent?.args?.streamAddress).to.equal(streamAddress);
      expect(poolEvent?.args?.poolAddress).to.not.be.equal(ethers.ZeroAddress);

      const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

      // Verify balances (refundedAmount0 = out token refund, refundedAmount1 = in token refund)
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(poolEvent?.args?.refundedAmount1 + creatorRevenue);
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(poolEvent?.args?.refundedAmount0);

      // Get price from the V2 pool
      const pool = await ethers.getContractAt("IUniswapV2Pair", poolEvent?.args?.poolAddress);
      const reserves = await pool.getReserves();
      const price = Number(reserves.reserve1) / Number(reserves.reserve0);

      const poolRatio = 1 / 4;
      const totalRevenue = subscriptionAmount
      const revenueAfterExitFee = Number(totalRevenue) * (1 - Number(exitFeeRatio) / 1e6);
      const poolInAmount = revenueAfterExitFee * poolRatio;
      const expectedPrice = Number(poolInAmount) / Number(poolOutAmount);


      expect(price).to.be.closeTo(1.111, 0.001);
    });

    it("Should handle finalize with Pool V3 creation", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .poolOutSupply(ethers.parseEther("25"))
          .streamOut(ethers.parseEther("100"))
          .setThreshold(ethers.parseEther("100"))
          .enablePoolCreation(true)
          .dex("v3")
          .build()
      );

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx = await contracts.stream.syncStreamExternal();
      await tx.wait();

      // Subscribe to reach threshold
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx2 = await contracts.stream.syncStreamExternal();
      await tx2.wait();

      const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

      // Finalize with pool creation
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      const receipt = await finalizeTx.wait();

      // Query logs from Stream contract for PoolCreated event
      const streamPoolCreatedInterface = new ethers.Interface([
        "event PoolCreated(address indexed streamAddress, address indexed poolAddress, address token0, address token1, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1, address indexed creator)"
      ]);

      const streamFinalizedInterface = new ethers.Interface([
        "event FinalizedStreamed(address indexed streamAddress, address indexed creator, uint256 creatorRevenue, uint256 exitFeeAmount, uint256 refundedOutAmount)"
      ]);

      // Get logs from Stream contract for FinalizedStreamed event
      const streamFinalizedTopic = ethers.id("FinalizedStreamed(address,address,uint256,uint256,uint256)");
      const streamFinalizedLogs = await ethers.provider.getLogs({
        address: await contracts.stream.getAddress(),
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [streamFinalizedTopic]
      });

      // Should have one FinalizedStreamed event
      expect(streamFinalizedLogs.length).to.equal(1);

      // Parse the finalized event
      const finalizedEvent = streamFinalizedInterface.parseLog(streamFinalizedLogs[0]);
      const creatorRevenue = finalizedEvent?.args?.creatorRevenue;
      const exitFeeAmount = finalizedEvent?.args?.exitFeeAmount;

      // Get logs from Stream contract
      const poolEventTopic = ethers.id("PoolCreated(address,address,address,address,uint256,uint256,uint256,uint256,address)");
      const streamAddress = await contracts.stream.getAddress();
      const poolLogs = await ethers.provider.getLogs({
        address: streamAddress,
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [poolEventTopic]
      });

      // Should have one PoolCreated event
      expect(poolLogs.length).to.equal(1);

      // Parse the pool event
      const poolEvent = streamPoolCreatedInterface.parseLog(poolLogs[0]);
      expect(poolEvent?.args?.streamAddress).to.equal(streamAddress);
      expect(poolEvent?.args?.poolAddress).to.not.be.equal(ethers.ZeroAddress);

      const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

      // Verify balances
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(poolEvent?.args?.refundedAmount1 + creatorRevenue);
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(poolEvent?.args?.refundedAmount0);

      // Get price from the v3 pool
      const pool = await ethers.getContractAt("IUniswapV3Pool", poolEvent?.args?.poolAddress);
      const slot0 = await pool.slot0();
      const sqrtPriceX96 = slot0.sqrtPriceX96;

      // Convert sqrtPriceX96 to readable price
      const price = 1 / (Number(sqrtPriceX96) / (2 ** 96)) ** 2;

      expect(price).to.be.closeTo(1.111, 0.001);

    });

    it("Should handle finalize with Pool Aerodrome creation", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .poolOutSupply(ethers.parseEther("25"))
          .streamOut(ethers.parseEther("100"))
          .setThreshold(ethers.parseEther("100"))
          .enablePoolCreation(true)
          .forkDetails(undefined, "baseAerodrome")
          .build()
      );

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx = await contracts.stream.syncStreamExternal();
      await tx.wait();

      // Subscribe to reach threshold
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);


      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      const tx2 = await contracts.stream.syncStreamExternal();
      await tx2.wait();

      const creatorInBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

      // Finalize with pool creation
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      const receipt = await finalizeTx.wait();

      // Query logs from Stream contract for PoolCreated event
      const streamPoolCreatedInterface = new ethers.Interface([
        "event PoolCreated(address indexed streamAddress, address indexed poolAddress, address token0, address token1, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1, address indexed creator)"
      ]);
      const streamFinalizedInterface = new ethers.Interface([
        "event FinalizedStreamed(address indexed streamAddress, address indexed creator, uint256 creatorRevenue, uint256 exitFeeAmount, uint256 refundedOutAmount)"
      ]);

      // Get logs from Stream contract for FinalizedStreamed event
      const streamFinalizedTopic = ethers.id("FinalizedStreamed(address,address,uint256,uint256,uint256)");
      const streamFinalizedLogs = await ethers.provider.getLogs({
        address: await contracts.stream.getAddress(),
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [streamFinalizedTopic]
      });

      // Should have one FinalizedStreamed event
      expect(streamFinalizedLogs.length).to.equal(1);

      // Parse the finalized event
      const finalizedEvent = streamFinalizedInterface.parseLog(streamFinalizedLogs[0]);
      const creatorRevenue = finalizedEvent?.args?.creatorRevenue;
      const exitFeeAmount = finalizedEvent?.args?.exitFeeAmount;

      // Get logs from Stream contract
      const poolEventTopic = ethers.id("PoolCreated(address,address,address,address,uint256,uint256,uint256,uint256,address)");
      const streamAddress = await contracts.stream.getAddress();
      const poolLogs = await ethers.provider.getLogs({
        address: streamAddress,
        fromBlock: receipt?.blockNumber,
        toBlock: receipt?.blockNumber,
        topics: [poolEventTopic]
      });

      // Should have one PoolCreated event
      expect(poolLogs.length).to.equal(1);

      // Parse the pool event
      const poolEvent = streamPoolCreatedInterface.parseLog(poolLogs[0]);
      expect(poolEvent?.args?.streamAddress).to.equal(streamAddress);
      expect(poolEvent?.args?.poolAddress).to.not.be.equal(ethers.ZeroAddress);

      const creatorInBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.creator.address);
      const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);

      // Verify balances
      expect(creatorInBalanceAfter - creatorInBalanceBefore).to.equal(poolEvent?.args?.refundedAmount0 + creatorRevenue);
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(poolEvent?.args?.refundedAmount1);

      // Get price from the Aerodrome pool
      const pool = await ethers.getContractAt("IAerodromePool", poolEvent?.args?.poolAddress);

      // Try getReserves first, fallback to individual calls
      let reserve0, reserve1;
      const reserves = await pool.getReserves();
      reserve0 = reserves[0];
      reserve1 = reserves[1];


      const price = Number(reserve1) / Number(reserve0);
      expect(price).to.be.closeTo(1.111, 0.001);
    });
  });

  describe("Finalize with Threshold Not Reached", function () {
    it("Should finalize stream and refund out tokens when threshold is not reached", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(stream().setThreshold(ethers.parseEther("100")).build());

      // Fast forward time to stream start
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Query stream state
      const streamState = await contracts.stream.getStreamState();
      const threshold = streamState.threshold;

      // Subscribe to the stream
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), threshold - ethers.parseEther("1"));
      await contracts.stream.connect(accounts.subscriber1).subscribe(threshold - ethers.parseEther("1"));

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Check initial balances
      const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
      const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
      const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

      // Verify balances
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
      expect(streamOutBalanceAfter).to.equal(0);

      // Verify event emission
      await expect(finalizeTx)
        .to.emit(contracts.stream, "FinalizedRefunded")
        .withArgs(contracts.stream.getAddress(), accounts.creator.address, config.streamOutAmount);
    });
  });

  describe("Finalize Edge Cases", function () {
    it("Should not allow finalize during waiting period", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      await expect(contracts.stream.connect(accounts.creator).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "OperationNotAllowed",
      );
    });

    it("Should not allow finalize during bootstrapping period", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(ethers.parseEther("100")).build());
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(contracts.stream.connect(accounts.creator).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "OperationNotAllowed",
      );
    });

    it("Should not allow finalize during active period", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(ethers.parseEther("100")).build());
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(contracts.stream.connect(accounts.creator).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "OperationNotAllowed",
      );
    });

    it("Should not allow non-creator to finalize", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      await expect(contracts.stream.connect(accounts.subscriber1).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "Unauthorized",
      );
    });

    it("Should not allow finalize after already finalized", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Finalize once
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Try to finalize again
      await expect(contracts.stream.connect(accounts.creator).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "OperationNotAllowed",
      );
    });

    it("Should handle recurring finalize attempts by different users", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // First finalize by creator
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Try to finalize again by different users
      await expect(contracts.stream.connect(accounts.subscriber1).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "Unauthorized",
      );

      await expect(contracts.stream.connect(accounts.subscriber2).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "Unauthorized",
      );

      await expect(contracts.stream.connect(accounts.protocolAdmin).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "Unauthorized",
      );

      await expect(contracts.stream.connect(accounts.protocolAdmin).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "Unauthorized",
      );
      // Requiring finalize call by creator
      await expect(contracts.stream.connect(accounts.creator).finalizeStream()).to.be.revertedWithCustomError(
        contracts.stream,
        "OperationNotAllowed",
      );
    });

    it("Should handle finalize with no subscriptions and zero threshold", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(0n).build());

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Check initial balances
      const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
      const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
      const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

      // Verify balances
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
      expect(streamOutBalanceAfter).to.equal(0);

      // Verify status
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedStreamed);
    });

    it("Should handle finalize with no subscriptions and non-zero threshold", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().setThreshold(100n).build());

      // Fast forward time to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream
      await contracts.stream.syncStreamExternal();

      // Check initial balances
      const creatorOutBalanceBefore = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
      const streamOutBalanceBefore = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

      // Finalize the stream
      const finalizeTx = await contracts.stream.connect(accounts.creator).finalizeStream();
      await finalizeTx.wait();

      // Check final balances
      const creatorOutBalanceAfter = await contracts.outSupplyToken.balanceOf(accounts.creator.address);
      const streamOutBalanceAfter = await contracts.outSupplyToken.balanceOf(contracts.stream.getAddress());

      // Verify balances
      expect(creatorOutBalanceAfter - creatorOutBalanceBefore).to.equal(streamOutBalanceBefore);
      expect(streamOutBalanceAfter).to.equal(0);

      // Verify status
      expect(await contracts.stream.getStreamStatus()).to.equal(Status.FinalizedRefunded);
    });
  });

  describe("Native Token Finalization", function () {
    it("Should handle stream finalization with native token", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream().nativeToken().build()
      );

      // Subscribe with native token during bootstrapping
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const subscriptionAmount = ethers.parseEther("1");
      await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithNativeToken(subscriptionAmount, { value: subscriptionAmount });

      // Fast forward to after stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Check creators native token balance
      const creatorNativeBalanceBefore = await ethers.provider.getBalance(accounts.creator.address);

      // Finalize the stream (must be called by creator)
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Check creators native token balance
      const creatorNativeBalanceAfter = await ethers.provider.getBalance(accounts.creator.address);
      expect(creatorNativeBalanceAfter).to.be.greaterThan(creatorNativeBalanceBefore);
    });
  });
});
