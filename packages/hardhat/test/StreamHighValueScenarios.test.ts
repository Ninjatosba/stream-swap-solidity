import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "./helpers/StreamFixtureBuilder";

describe("High Value Stream Scenarios", function () {
  const HIGH_THRESHOLD = ethers.parseEther("1000000"); // 1M tokens threshold
  const LARGE_STREAM_OUT = ethers.parseEther("5000000"); // 5M tokens out supply

  describe("Large Scale Multi-Subscriber Scenario", function () {
    it("Should handle multiple high-value subscribers with position updates", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream().setThreshold(HIGH_THRESHOLD).streamOut(LARGE_STREAM_OUT).exitRatio(0).build(),
      );

      // Fast forward to bootstrapping phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      // Whale subscriber (60% of threshold)
      const whaleAmount = (HIGH_THRESHOLD * BigInt(60)) / BigInt(100);
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), whaleAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(whaleAmount);

      // Large subscriber (30% of threshold)
      const largeAmount = (HIGH_THRESHOLD * BigInt(40)) / BigInt(100);
      await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), largeAmount);
      await contracts.stream.connect(accounts.subscriber2).subscribe(largeAmount);

      // Move to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      // Update positions at 25% through stream
      const streamDuration = BigInt(timeParams.streamEndTime - timeParams.streamStartTime);
      const quarterStreamTime = BigInt(timeParams.streamStartTime) + streamDuration / BigInt(4);
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(quarterStreamTime)]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();
      // Update positions
      await contracts.stream.connect(accounts.subscriber1).syncPositionExternal(accounts.subscriber1.address);
      await contracts.stream.connect(accounts.subscriber2).syncPositionExternal(accounts.subscriber2.address);

      // Check positions
      const whalePosition = await contracts.stream.getPosition(accounts.subscriber1.address);
      const largePosition = await contracts.stream.getPosition(accounts.subscriber2.address);

      // Verify positions are proportional to their contributions
      expect(whalePosition.shares).to.be.gt(largePosition.shares);
      expect(whalePosition.purchased).to.be.gt(largePosition.purchased);

      // Move to stream end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      // Exit streams and verify output token distribution
      await contracts.stream.connect(accounts.subscriber1).exitStream();
      await contracts.stream.connect(accounts.subscriber2).exitStream();

      // Finalize stream
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Verify final balances
      const whale1Balance = await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address);
      const large2Balance = await contracts.outSupplyToken.balanceOf(accounts.subscriber2.address);

      // Verify proportional distribution
      expect(whale1Balance).to.be.gt(large2Balance);
      expect(whale1Balance).to.be.approximately(
        (LARGE_STREAM_OUT * BigInt(60)) / BigInt(100),
        BigInt(ethers.parseEther("10")),
      );
    });
  });

  describe("Vesting Scenarios", function () {
    it("Should properly vest tokens over time for different subscription levels", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .setThreshold(HIGH_THRESHOLD)
          .streamOut(LARGE_STREAM_OUT)
          .beneficiaryVesting(2 * 24 * 60 * 60)
          .exitRatio(0)
          .build(),
      );

      // Start at bootstrapping
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      // Two major subscribers
      const sub1Amount = (HIGH_THRESHOLD * BigInt(60)) / BigInt(100); // 60%
      const sub2Amount = (HIGH_THRESHOLD * BigInt(40)) / BigInt(100); // 40%

      // Subscribe
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), sub1Amount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(sub1Amount);

      await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), sub2Amount);
      await contracts.stream.connect(accounts.subscriber2).subscribe(sub2Amount);

      // Set time to end
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      // Exit streams at the end - this creates beneficiary vesting wallets
      const tx1 = await contracts.stream.connect(accounts.subscriber1).exitStream();
      const receipt1 = await tx1.wait();
      expect(receipt1).to.not.be.null;

      const tx2 = await contracts.stream.connect(accounts.subscriber2).exitStream();
      const receipt2 = await tx2.wait();
      expect(receipt2).to.not.be.null;

      // Parse VestingWalletCreated events from exitStream transactions
      const iface = new ethers.Interface([
        "event VestingWalletCreated(address indexed beneficiary, address indexed vestingWallet, uint64 startTime, uint64 duration, address token, uint256 amount)",
      ]);

      // Find VestingWalletCreated event in subscriber1's exitStream
      const vestingWalletCreatedLog1 = receipt1!.logs.find(log => {
        try {
          const parsed = iface.parseLog(log as any);
          return parsed?.name === "VestingWalletCreated";
        } catch {
          return false;
        }
      });
      expect(vestingWalletCreatedLog1).to.not.be.undefined;

      // Find VestingWalletCreated event in subscriber2's exitStream
      const vestingWalletCreatedLog2 = receipt2!.logs.find(log => {
        try {
          const parsed = iface.parseLog(log as any);
          return parsed?.name === "VestingWalletCreated";
        } catch {
          return false;
        }
      });
      expect(vestingWalletCreatedLog2).to.not.be.undefined;

      // Extract vesting wallet addresses
      const vestingWalletCreatedEvent1 = iface.parseLog(vestingWalletCreatedLog1 as any);
      const vestingWalletCreatedEvent2 = iface.parseLog(vestingWalletCreatedLog2 as any);

      const sub1VestingWallet = vestingWalletCreatedEvent1?.args?.vestingWallet;
      const sub2VestingWallet = vestingWalletCreatedEvent2?.args?.vestingWallet;

      expect(sub1VestingWallet).to.not.be.undefined;
      expect(sub1VestingWallet).to.not.be.equal(ethers.ZeroAddress);
      expect(sub2VestingWallet).to.not.be.undefined;
      expect(sub2VestingWallet).to.not.be.equal(ethers.ZeroAddress);

      // Get the block timestamp for each exitStream transaction
      const block1 = await ethers.provider.getBlock(receipt1!.blockNumber!);
      const block2 = await ethers.provider.getBlock(receipt2!.blockNumber!);

      // Use the correct ABI for OpenZeppelin VestingWallet
      const vestingWalletAbi = [
        "function beneficiary() view returns (address)",
        "function start() view returns (uint256)",
        "function duration() view returns (uint256)",
        "function release(address token)",
      ];
      const sub1VestingContract = await ethers.getContractAt(vestingWalletAbi, sub1VestingWallet) as any;
      const sub2VestingContract = await ethers.getContractAt(vestingWalletAbi, sub2VestingWallet) as any;

      // Check vesting parameters
      const sub1Owner = await sub1VestingContract.beneficiary();
      const sub1Start = await sub1VestingContract.start();
      const sub1Duration = await sub1VestingContract.duration();

      const sub2Owner = await sub2VestingContract.beneficiary();
      const sub2Start = await sub2VestingContract.start();
      const sub2Duration = await sub2VestingContract.duration();

      // Calculate end times manually
      const sub1End = sub1Start + sub1Duration;
      const sub2End = sub2Start + sub2Duration;

      // Validate vesting parameters
      expect(sub1Owner).to.be.equal(accounts.subscriber1.address);
      expect(sub2Owner).to.be.equal(accounts.subscriber2.address);
      expect(sub1Start).to.be.equal(BigInt(block1!.timestamp));
      expect(sub2Start).to.be.equal(BigInt(block2!.timestamp));
      expect(sub1Duration).to.be.equal(BigInt(2 * 24 * 60 * 60)); // 2 days
      expect(sub2Duration).to.be.equal(BigInt(2 * 24 * 60 * 60)); // 2 days
      expect(sub1End).to.be.equal(sub1Start + sub1Duration);
      expect(sub2End).to.be.equal(sub2Start + sub2Duration);

      // Check token balances in vesting wallets
      const sub1VestingBalance = await contracts.outSupplyToken.balanceOf(sub1VestingWallet);
      const sub2VestingBalance = await contracts.outSupplyToken.balanceOf(sub2VestingWallet);

      // Validate expected amounts (60% and 40% of stream output)
      const expectedSub1Amount = (LARGE_STREAM_OUT * BigInt(60)) / BigInt(100);
      const expectedSub2Amount = (LARGE_STREAM_OUT * BigInt(40)) / BigInt(100);

      expect(sub1VestingBalance).to.be.equal(expectedSub1Amount);
      expect(sub2VestingBalance).to.be.equal(expectedSub2Amount);

      // Finalize stream
      await contracts.stream.connect(accounts.creator).finalizeStream();

      // Verify vesting wallets still have tokens
      const finalSub1Balance = await contracts.outSupplyToken.balanceOf(sub1VestingWallet);
      const finalSub2Balance = await contracts.outSupplyToken.balanceOf(sub2VestingWallet);

      expect(finalSub1Balance).to.be.equal(expectedSub1Amount);
      expect(finalSub2Balance).to.be.equal(expectedSub2Amount);

      // Test claiming tokens at half vesting period
      const halfVestingTime = Number(sub1Start) + Number(sub1Duration) / 2;
      await ethers.provider.send("evm_setNextBlockTimestamp", [Math.floor(halfVestingTime)]);
      await ethers.provider.send("evm_mine", []);

      // Get initial balances before claiming
      const sub1InitialBalance = await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address);
      const sub2InitialBalance = await contracts.outSupplyToken.balanceOf(accounts.subscriber2.address);

      // Claim tokens from vesting wallets at halfway
      await sub1VestingContract.connect(accounts.subscriber1).release(contracts.outSupplyToken.getAddress());
      await sub2VestingContract.connect(accounts.subscriber2).release(contracts.outSupplyToken.getAddress());

      // Get final balances after claiming
      const sub1FinalBalance = await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address);
      const sub2FinalBalance = await contracts.outSupplyToken.balanceOf(accounts.subscriber2.address);

      // Calculate claimed amounts
      const sub1Claimed = sub1FinalBalance - sub1InitialBalance;
      const sub2Claimed = sub2FinalBalance - sub2InitialBalance;

      // Validate that approximately half of the tokens were claimed (50% of vesting period)
      const expectedSub1Claimed = expectedSub1Amount / BigInt(2);
      const expectedSub2Claimed = expectedSub2Amount / BigInt(2);

      // Use a 20 token tolerance to account for precision differences
      const tolerance = BigInt(ethers.parseEther("20")); // 20 token tolerance
      expect(sub1Claimed).to.be.approximately(expectedSub1Claimed, tolerance);
      expect(sub2Claimed).to.be.approximately(expectedSub2Claimed, tolerance);

      // Verify vesting wallets still have remaining tokens
      const halfwaySub1Balance = await contracts.outSupplyToken.balanceOf(sub1VestingWallet);
      const halfwaySub2Balance = await contracts.outSupplyToken.balanceOf(sub2VestingWallet);

      expect(halfwaySub1Balance).to.be.approximately(expectedSub1Claimed, tolerance);
      expect(halfwaySub2Balance).to.be.approximately(expectedSub2Claimed, tolerance);
    });
  });
});
