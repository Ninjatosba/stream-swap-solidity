import { expect } from "chai";
import { ethers } from "hardhat";
import { PositionTypes, StreamTypes } from "../../typechain-types/src/StreamCore";
import { Status } from "../types";

describe("StreamMathLib", function () {
  let mockContract: any;

  beforeEach(async function () {
    // Deploy a mock contract that exposes the library functions
    const StreamMathLibMock = await ethers.getContractFactory("StreamMathLibMock");
    mockContract = await StreamMathLibMock.deploy();
    await mockContract.waitForDeployment();
  });

  describe("calculateDiff", function () {
    it("should return 0 if current timestamp is before stream start", async function () {
      const currentTimestamp = 100;
      const streamStartTime = 200;
      const streamEndTime = 300;
      const lastUpdated = 50;

      const result = await mockContract.calculateDiff(currentTimestamp, streamStartTime, streamEndTime, lastUpdated);

      expect(result[0]).to.equal(0);
    });

    it("should return 0 if lastUpdated is after stream end", async function () {
      const currentTimestamp = 250;
      const streamStartTime = 200;
      const streamEndTime = 300;
      const lastUpdated = 350;

      const result = await mockContract.calculateDiff(currentTimestamp, streamStartTime, streamEndTime, lastUpdated);

      expect(result[0]).to.equal(0);
    });

    it("should calculate correct ratio for active stream", async function () {
      const currentTimestamp = 250;
      const streamStartTime = 200;
      const streamEndTime = 300;
      const lastUpdated = 220;

      const result = await mockContract.calculateDiff(currentTimestamp, streamStartTime, streamEndTime, lastUpdated);

      // Expected: (250-220)/(300-220) * 1e18 = 30/80 * 1e18 = 0.375 * 1e18
      const expected = ethers.parseUnits("0.375", 6);
      expect(result[0]).to.equal(expected);
    });

    it("should adjust lastUpdated to streamStartTime if it's before start", async function () {
      const currentTimestamp = 250;
      const streamStartTime = 200;
      const streamEndTime = 300;
      const lastUpdated = 150; // Before start time

      const result = await mockContract.calculateDiff(currentTimestamp, streamStartTime, streamEndTime, lastUpdated);

      // Expected: (250-200)/(300-200) * 1e18 = 50/100 * 1e18 = 0.5 * 1e18
      const expected = ethers.parseUnits("0.5", 6);
      expect(result[0]).to.equal(expected);
    });

    it("should adjust currentTimestamp to streamEndTime if it's after end", async function () {
      const currentTimestamp = 350; // After end time
      const streamStartTime = 200;
      const streamEndTime = 300;
      const lastUpdated = 220;

      const result = await mockContract.calculateDiff(currentTimestamp, streamStartTime, streamEndTime, lastUpdated);

      // Expected: (300-220)/(300-220) * 1e18 = 80/80 * 1e18 = 1.0 * 1e18
      const expected = ethers.parseUnits("1.0", 6);
      expect(result[0]).to.equal(expected);
    });

    it("should return 0 if numerator or denominator is 0", async function () {
      // Case where currentTimestamp equals lastUpdated (numerator = 0)
      const result1 = await mockContract.calculateDiff(220, 200, 300, 220);
      expect(result1[0]).to.equal(0);

      // Case where lastUpdated equals streamEndTime (denominator = 0)
      const result2 = await mockContract.calculateDiff(310, 200, 300, 300);
      expect(result2[0]).to.equal(0);
    });
  });

  describe("calculateStreamStatus", function () {
    it("should return Waiting when current time is before bootstrapping start", async function () {
      const currentStatus = Status.Waiting;
      const currentTime = 90;
      const bootstrappingStartTime = 100;
      const streamStartTime = 200;
      const streamEndTime = 300;

      const result = await mockContract.calculateStreamStatus(
        currentStatus,
        currentTime,
        bootstrappingStartTime,
        streamStartTime,
        streamEndTime,
      );

      expect(result).to.equal(Status.Waiting);
    });

    it("should return Bootstrapping when current time is in bootstrapping phase", async function () {
      const currentStatus = Status.Waiting;
      const currentTime = 150;
      const bootstrappingStartTime = 100;
      const streamStartTime = 200;
      const streamEndTime = 300;

      const result = await mockContract.calculateStreamStatus(
        currentStatus,
        currentTime,
        bootstrappingStartTime,
        streamStartTime,
        streamEndTime,
      );

      expect(result).to.equal(Status.Bootstrapping);
    });

    it("should return Active when current time is in active streaming phase", async function () {
      const currentStatus = Status.Bootstrapping;
      const currentTime = 250;
      const bootstrappingStartTime = 100;
      const streamStartTime = 200;
      const streamEndTime = 300;

      const result = await mockContract.calculateStreamStatus(
        currentStatus,
        currentTime,
        bootstrappingStartTime,
        streamStartTime,
        streamEndTime,
      );

      expect(result).to.equal(Status.Active);
    });

    it("should return Ended when current time is after stream end", async function () {
      const currentStatus = Status.Active;
      const currentTime = 350;
      const bootstrappingStartTime = 100;
      const streamStartTime = 200;
      const streamEndTime = 300;

      const result = await mockContract.calculateStreamStatus(
        currentStatus,
        currentTime,
        bootstrappingStartTime,
        streamStartTime,
        streamEndTime,
      );

      expect(result).to.equal(Status.Ended);
    });

    it("should not change status if it's in a final state", async function () {
      const finalStates = [Status.Cancelled, Status.FinalizedRefunded, Status.FinalizedStreamed];

      for (const status of finalStates) {
        const result = await mockContract.calculateStreamStatus(
          status,
          350, // Current time after end time
          100,
          200,
          300,
        );
        expect(result).to.equal(status);
      }
    });
  });

  describe("calculateUpdatedState", function () {
    it("should not update state if diff is 0", async function () {
      const state: StreamTypes.StreamStateStruct = {
        shares: ethers.parseUnits("1", 18), // 1e18
        inSupply: ethers.parseUnits("1000", 18), // 1000e18
        outRemaining: ethers.parseUnits("2000", 18), // 2000e18
        currentStreamedPrice: {
          value: 5e5,
        },
        distIndex: {
          value: 0,
        },
        spentIn: 0,
        threshold: ethers.parseUnits("1000", 18), // 1000e18
        outSupply: ethers.parseUnits("2000", 18), // 2000e18
        lastUpdated: 0,
      };

      const diff = {
        value: 0,
      };
      const result = await mockContract.calculateUpdatedState(state, diff);

      expect(result.shares).to.equal(state.shares);
      expect(result.inSupply).to.equal(state.inSupply);
      expect(result.outRemaining).to.equal(state.outRemaining);
      expect(result.currentStreamedPrice[0]).to.equal(state.currentStreamedPrice.value);
      expect(result.distIndex[0]).to.equal(state.distIndex.value);
      expect(result.spentIn).to.equal(state.spentIn);
    });

    it("should not update state if shares is 0", async function () {
      const state: StreamTypes.StreamStateStruct = {
        shares: 0, // 0 shares
        inSupply: ethers.parseUnits("1000", 18), // 1000e18
        outRemaining: ethers.parseUnits("2000", 18), // 2000e18
        currentStreamedPrice: {
          value: 5e5,
        }, // 0.5e18
        distIndex: {
          value: 0,
        },
        spentIn: 0,
        threshold: ethers.parseUnits("1000", 18), // 1000e18
        outSupply: ethers.parseUnits("2000", 18), // 2000e18
        lastUpdated: 0,
      };

      const diff = {
        value: ethers.parseUnits("0.5", 6),
      }; // 0.5e18
      const result = await mockContract.calculateUpdatedState(state, diff);

      expect(result.shares).to.equal(state.shares);
      expect(result.inSupply).to.equal(state.inSupply);
      expect(result.outRemaining).to.equal(state.outRemaining);
      expect(result.currentStreamedPrice[0]).to.equal(state.currentStreamedPrice.value);
      expect(result.distIndex[0]).to.equal(state.distIndex.value);
      expect(result.spentIn).to.equal(state.spentIn);
    });

    it("should correctly update state with 50% time diff", async function () {
      const state: StreamTypes.StreamStateStruct = {
        shares: ethers.parseUnits("1", 18), // 1 share
        inSupply: ethers.parseUnits("1000", 18), // 1000 token
        outRemaining: ethers.parseUnits("2000", 18), // 2000 token
        currentStreamedPrice: {
          value: 5e5,
        },
        distIndex: {
          value: 0,
        },
        spentIn: 0,
        threshold: ethers.parseUnits("1000", 18), // 1000e18
        outSupply: ethers.parseUnits("2000", 18), // 2000e18
        lastUpdated: 0,
      };

      // 50% time diff (0.5e18)
      const diff = {
        value: ethers.parseUnits("0.5", 6),
      };
      const result = await mockContract.calculateUpdatedState(state, diff);

      // Should spend 50% of inSupply: 500 tokens
      expect(result.spentIn).to.equal(ethers.parseUnits("500", 18));
      // Should have 500 tokens left in inSupply
      expect(result.inSupply).to.equal(ethers.parseUnits("500", 18));
      // Should distribute 50% of outRemaining: 1000 tokens
      expect(result.outRemaining).to.equal(ethers.parseUnits("1000", 18));
      // Index should increase by distributed amount / shares: 1000e18 / 1 = 1000e18
      expect(result.distIndex[0]).to.equal(1000000000n); // 1000 * 1e6
      // Current price should be spentIn / distributedAmount: 500 / 1000 = 0.5
      expect(result.currentStreamedPrice[0]).to.equal(BigInt(state.currentStreamedPrice.value));
    });

    it("should handle full time diff (100%)", async function () {
      const state: StreamTypes.StreamStateStruct = {
        shares: ethers.parseUnits("1", 18), // 1 share
        inSupply: ethers.parseUnits("1000", 18), // 1000 token
        outRemaining: ethers.parseUnits("2000", 18), // 2000 token
        currentStreamedPrice: {
          value: 5e5,
        },
        distIndex: {
          value: 0,
        },
        spentIn: 0,
        threshold: ethers.parseUnits("1000", 18), // 1000e18
        outSupply: ethers.parseUnits("2000", 18), // 2000e18
        lastUpdated: 0,
      };

      // 100% time diff (1e18)
      const diff = {
        value: ethers.parseUnits("1", 6),
      };
      const result = await mockContract.calculateUpdatedState(state, diff);

      // Should spend 100% of inSupply: 1000 tokens
      expect(result.spentIn).to.equal(ethers.parseUnits("1000", 18));
      // Should have 0 tokens left in inSupply
      expect(result.inSupply).to.equal(0);
      // Should distribute 100% of outRemaining: 2000 tokens
      expect(result.outRemaining).to.equal(0);
      // Index should increase by distributed amount / shares: 2000e18 / 1 = 2000e18
      expect(result.distIndex[0]).to.equal(2000000000n); // 2000 * 1e6
      // Current price should be spentIn / distributedAmount: 1000 / 2000 = 0.5
      expect(result.currentStreamedPrice[0]).to.equal(BigInt(state.currentStreamedPrice.value));
    });
  });

  describe("computeSharesAmount", function () {
    it("should return amountIn when totalShares is 0", async function () {
      const amountIn = ethers.parseUnits("1000", 18); // 1000 tokens
      const roundUp = false;
      const inSupply = ethers.parseUnits("5000", 18); // 5000 tokens
      const totalShares = 0;

      const result = await mockContract.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
      expect(result).to.equal(amountIn);
    });

    it("should return amountIn when amountIn is 0", async function () {
      const amountIn = 0;
      const roundUp = false;
      const inSupply = ethers.parseUnits("5000", 18); // 5000 tokens
      const totalShares = ethers.parseUnits("2", 18); // 2 shares

      const result = await mockContract.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
      expect(result).to.equal(amountIn);
    });

    it("should return amountIn when inSupply is 0", async function () {
      const amountIn = ethers.parseUnits("100", 18); // 100 tokens
      const roundUp = false;
      const inSupply = 0; // 0 tokens in supply
      const totalShares = 0; // 0 shares

      const result = await mockContract.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
      expect(result).to.equal(amountIn);
    });

    it("should calculate shares with 1:1 ratio when adding first shares", async function () {
      const amountIn = ethers.parseUnits("100", 18); // 100 tokens
      const roundUp = false;
      const inSupply = ethers.parseUnits("100", 18); // 100 tokens
      const totalShares = ethers.parseUnits("100", 18); // 100 shares

      const result = await mockContract.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
      expect(result).to.equal(ethers.parseUnits("100", 18)); // Should get 100 shares
    });

    it("should calculate shares with correct ratio after multiple additions", async function () {
      const amountIn = ethers.parseUnits("250", 18); // 250 tokens
      const roundUp = false;
      const inSupply = ethers.parseUnits("200", 18); // 200 tokens in supply
      const totalShares = ethers.parseUnits("200", 18); // 200 shares already

      const result = await mockContract.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
      expect(result).to.equal(ethers.parseUnits("250", 18)); // Should get 250 shares
    });

    it("should calculate shares with rounding up for redemption", async function () {
      const amountIn = ethers.parseUnits("100", 18); // 100 tokens
      const roundUp = true; // round up for redemption
      const inSupply = ethers.parseUnits("350", 18); // 350 tokens in supply
      const totalShares = ethers.parseUnits("350", 18); // 350 shares

      const result = await mockContract.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
      expect(result).to.equal(ethers.parseUnits("100", 18)); // Should get 100 shares
    });

    it("should not overflow under realistic high-value, long-duration stream conditions", async function () {
      /**
       * OVERFLOW RISK ANALYSIS
       * Simulates a long stream (~11 hours) with ~500M tokens to test overflow safety.
       */
      let inSupply = 0n;
      let totalShares = 0n;
      let totalInvestment = 0n;
      const streamDuration = 40000n;

      // Phase 1: Early Subscribers
      for (let i = 1; i <= 1000; i++) {
        const baseAmount = 200000 + (i % 100000);
        const amountIn = ethers.parseUnits(baseAmount.toString(), 18);
        totalInvestment += amountIn;
        const result = await mockContract.computeSharesAmount(amountIn, false, inSupply, totalShares);
        inSupply += amountIn;
        totalShares += result;
        inSupply = (inSupply * (streamDuration - 1n)) / streamDuration;
      }

      // Phase 2: Time Gap
      const timeGap = 38000n;
      const remainingDurationAfterGapStarts = streamDuration - 1000n;
      inSupply -= (inSupply * timeGap) / remainingDurationAfterGapStarts;

      // Phase 3: Late Subscribers
      for (let i = 1; i <= 1000; i++) {
        const baseAmount = 200000 + (i % 100000);
        const amountIn = ethers.parseUnits(baseAmount.toString(), 18);
        totalInvestment += amountIn;
        const result = await mockContract.computeSharesAmount(amountIn, false, inSupply, totalShares);
        inSupply += amountIn;
        totalShares += result;
      }

      // Test completed successfully - no overflow
      expect(true).to.be.true;
    });
  });

  describe("calculateExitFee", function () {
    it("should calculate 0 fee for 0% exit fee", async function () {
      const spentInAmount = ethers.parseUnits("1000", 18);
      const ExitFeeRatio = { value: 0 };
      const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, ExitFeeRatio);
      expect(feeAmount).to.equal(ethers.parseUnits("0", 18));
      expect(remainingAmount).to.equal(spentInAmount);
    });

    it("should calculate correct fee for 10% exit fee", async function () {
      const spentInAmount = ethers.parseUnits("1000", 18);
      const ExitFeeRatio = { value: 100000 };

      const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, ExitFeeRatio);

      expect(feeAmount).to.equal(ethers.parseUnits("100", 18));
      expect(remainingAmount).to.equal(ethers.parseUnits("900", 18));
    });

    it("should handle small amounts correctly", async function () {
      const spentInAmount = 1;
      const ExitFeeRatio = { value: 100000 };

      const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, ExitFeeRatio);

      expect(feeAmount).to.equal(0);
      expect(remainingAmount).to.equal(1);
    });

    it("should calculate 100% fee correctly", async function () {
      const spentInAmount = 1000;
      const ExitFeeRatio = { value: 1000000 }; // 100%

      const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, ExitFeeRatio);

      expect(feeAmount).to.equal(1000);
      expect(remainingAmount).to.equal(0);
    });
  });

  describe("syncPosition", function () {
    it("should update position", async function () {
      const position: PositionTypes.PositionStruct = {
        inBalance: ethers.parseUnits("500000", 0),
        shares: ethers.parseUnits("500000", 0),
        index: { value: 0 },
        lastUpdateTime: 1000100,
        pendingReward: { value: 0 },
        spentIn: ethers.parseUnits("0", 0),
        purchased: ethers.parseUnits("0", 0),
        exitDate: 0,
      };

      const distIndex = { value: ethers.parseUnits("1", 6) };
      const shares = ethers.parseUnits("500000", 0);
      const inSupply = ethers.parseUnits("250000", 0);
      const nowTime = 2000000;

      const result = await mockContract.syncPosition(position, distIndex, shares, inSupply, nowTime);

      expect(result.inBalance).to.equal(ethers.parseUnits("250000", 0));
      expect(result.shares).to.equal(ethers.parseUnits("500000", 0));
      expect(result.index[0]).to.equal(distIndex.value);
      expect(result.lastUpdateTime).to.equal(nowTime);
      expect(result.pendingReward[0]).to.equal(0);
      expect(result.spentIn).to.equal(ethers.parseUnits("250000", 0));
      expect(result.purchased).to.equal(ethers.parseUnits("500000", 0));
    });

    it("Multiple Subscribers with Equal Shares", async function () {
      const positionA: PositionTypes.PositionStruct = {
        inBalance: ethers.parseUnits("250000", 0),
        shares: ethers.parseUnits("250000", 0),
        index: { value: 0 },
        lastUpdateTime: 1000000,
        pendingReward: { value: 0 },
        spentIn: ethers.parseUnits("0", 0),
        purchased: ethers.parseUnits("0", 0),
        exitDate: 0,
      };

      const distIndex = { value: ethers.parseUnits("1", 6) };
      const totalShares = ethers.parseUnits("500000", 0);
      const inSupply = ethers.parseUnits("250000", 0);
      const nowTime = 2000000;

      const resultA = await mockContract.syncPosition(positionA, distIndex, totalShares, inSupply, nowTime);

      expect(resultA.inBalance).to.equal(ethers.parseUnits("125000", 0));
      expect(resultA.shares).to.equal(ethers.parseUnits("250000", 0));
      expect(resultA.index[0]).to.equal(distIndex.value);
      expect(resultA.spentIn).to.equal(ethers.parseUnits("125000", 0));
      expect(resultA.purchased).to.equal(ethers.parseUnits("250000", 0));
    });

    it("Multiple Subscribers with Unequal Shares", async function () {
      const positionA: PositionTypes.PositionStruct = {
        inBalance: ethers.parseUnits("300000", 0),
        shares: ethers.parseUnits("300000", 0),
        index: { value: 0 },
        lastUpdateTime: 1000000,
        pendingReward: { value: 0 },
        spentIn: ethers.parseUnits("0", 0),
        purchased: ethers.parseUnits("0", 0),
        exitDate: 0,
      };

      const distIndex = { value: ethers.parseUnits("1", 6) };
      const totalShares = ethers.parseUnits("500000", 0);
      const inSupply = ethers.parseUnits("250000", 0);
      const nowTime = 2000000;

      const resultA = await mockContract.syncPosition(positionA, distIndex, totalShares, inSupply, nowTime);

      expect(resultA.inBalance).to.equal(ethers.parseUnits("150000", 0));
      expect(resultA.shares).to.equal(ethers.parseUnits("300000", 0));
      expect(resultA.index[0]).to.equal(distIndex.value);
      expect(resultA.spentIn).to.equal(ethers.parseUnits("150000", 0));
      expect(resultA.purchased).to.equal(ethers.parseUnits("300000", 0));
    });

    it("Late Subscriber Case", async function () {
      const positionB: PositionTypes.PositionStruct = {
        inBalance: ethers.parseUnits("200000", 0),
        shares: ethers.parseUnits("240000", 0),
        index: { value: ethers.parseUnits("1", 6) },
        lastUpdateTime: 1300000,
        pendingReward: { value: 0 },
        spentIn: ethers.parseUnits("0", 0),
        purchased: ethers.parseUnits("0", 0),
        exitDate: 0,
      };

      const distIndex = { value: ethers.parseUnits("1.5681", 6) };
      const totalShares = ethers.parseUnits("440000", 0);
      const inSupply = ethers.parseUnits("250000", 0);
      const nowTime = 1500000;

      const resultB = await mockContract.syncPosition(positionB, distIndex, totalShares, inSupply, nowTime);

      expect(resultB.inBalance).to.equal(ethers.parseUnits("136363", 0));
      expect(resultB.shares).to.equal(ethers.parseUnits("240000", 0));
      expect(resultB.index[0]).to.equal(distIndex.value);
      expect(resultB.spentIn).to.equal(ethers.parseUnits("63637", 0));
      expect(resultB.purchased).to.equal(ethers.parseUnits("136344", 0));
    });
  });
});
