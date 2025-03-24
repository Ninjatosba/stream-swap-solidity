import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { IStreamTypes, PositionTypes, StreamMathLibMock } from "../typechain-types/contracts/StreamMathLibMock";

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

            const result = await mockContract.calculateDiff(
                currentTimestamp,
                streamStartTime,
                streamEndTime,
                lastUpdated
            );

            expect(result).to.equal(0);
        });

        it("should return 0 if lastUpdated is after stream end", async function () {
            const currentTimestamp = 250;
            const streamStartTime = 200;
            const streamEndTime = 300;
            const lastUpdated = 350;

            const result = await mockContract.calculateDiff(
                currentTimestamp,
                streamStartTime,
                streamEndTime,
                lastUpdated
            );

            expect(result).to.equal(0);
        });

        it("should calculate correct ratio for active stream", async function () {
            const currentTimestamp = 250;
            const streamStartTime = 200;
            const streamEndTime = 300;
            const lastUpdated = 220;

            const result = await mockContract.calculateDiff(
                currentTimestamp,
                streamStartTime,
                streamEndTime,
                lastUpdated
            );

            // Expected: (250-220)/(300-220) * 1e18 = 30/80 * 1e18 = 0.375 * 1e18
            const expected = ethers.parseUnits("0.375", 18);
            expect(result).to.equal(expected);
        });

        it("should adjust lastUpdated to streamStartTime if it's before start", async function () {
            const currentTimestamp = 250;
            const streamStartTime = 200;
            const streamEndTime = 300;
            const lastUpdated = 150; // Before start time

            const result = await mockContract.calculateDiff(
                currentTimestamp,
                streamStartTime,
                streamEndTime,
                lastUpdated
            );

            // Expected: (250-200)/(300-200) * 1e18 = 50/100 * 1e18 = 0.5 * 1e18
            const expected = ethers.parseUnits("0.5", 18);
            expect(result).to.equal(expected);
        });

        it("should adjust currentTimestamp to streamEndTime if it's after end", async function () {
            const currentTimestamp = 350; // After end time
            const streamStartTime = 200;
            const streamEndTime = 300;
            const lastUpdated = 220;

            const result = await mockContract.calculateDiff(
                currentTimestamp,
                streamStartTime,
                streamEndTime,
                lastUpdated
            );

            // Expected: (300-220)/(300-220) * 1e18 = 80/80 * 1e18 = 1.0 * 1e18
            const expected = ethers.parseUnits("1.0", 18);
            expect(result).to.equal(expected);
        });

        it("should return 0 if numerator or denominator is 0", async function () {
            // Case where currentTimestamp equals lastUpdated (numerator = 0)
            const result1 = await mockContract.calculateDiff(220, 200, 300, 220);
            expect(result1).to.equal(0);

            // Case where lastUpdated equals streamEndTime (denominator = 0)
            const result2 = await mockContract.calculateDiff(310, 200, 300, 300);
            expect(result2).to.equal(0);
        });
    });

    describe("calculateStreamStatus", function () {
        const STATUSES = {
            Waiting: 0,
            Bootstrapping: 1,
            Active: 2,
            Ended: 3,
            Cancelled: 4,
            FinalizedRefunded: 5,
            FinalizedStreamed: 6
        };

        it("should return Waiting when current time is before bootstrapping start", async function () {
            const currentStatus = STATUSES.Waiting;
            const currentTime = 90;
            const bootstrappingStartTime = 100;
            const streamStartTime = 200;
            const streamEndTime = 300;

            const result = await mockContract.calculateStreamStatus(
                currentStatus,
                currentTime,
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime
            );

            expect(result).to.equal(STATUSES.Waiting);
        });

        it("should return Bootstrapping when current time is in bootstrapping phase", async function () {
            const currentStatus = STATUSES.Waiting;
            const currentTime = 150;
            const bootstrappingStartTime = 100;
            const streamStartTime = 200;
            const streamEndTime = 300;

            const result = await mockContract.calculateStreamStatus(
                currentStatus,
                currentTime,
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime
            );

            expect(result).to.equal(STATUSES.Bootstrapping);
        });

        it("should return Active when current time is in active streaming phase", async function () {
            const currentStatus = STATUSES.Bootstrapping;
            const currentTime = 250;
            const bootstrappingStartTime = 100;
            const streamStartTime = 200;
            const streamEndTime = 300;

            const result = await mockContract.calculateStreamStatus(
                currentStatus,
                currentTime,
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime
            );

            expect(result).to.equal(STATUSES.Active);
        });

        it("should return Ended when current time is after stream end", async function () {
            const currentStatus = STATUSES.Active;
            const currentTime = 350;
            const bootstrappingStartTime = 100;
            const streamStartTime = 200;
            const streamEndTime = 300;

            const result = await mockContract.calculateStreamStatus(
                currentStatus,
                currentTime,
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime
            );

            expect(result).to.equal(STATUSES.Ended);
        });

        it("should not change status if it's in a final state", async function () {
            const finalStates = [STATUSES.Cancelled, STATUSES.FinalizedRefunded, STATUSES.FinalizedStreamed];

            for (const status of finalStates) {
                const result = await mockContract.calculateStreamStatus(
                    status,
                    350, // Current time after end time
                    100,
                    200,
                    300
                );
                expect(result).to.equal(status);
            }
        });
    });

    describe("calculateUpdatedState", function () {
        it("should not update state if diff is 0", async function () {
            const state: IStreamTypes.StreamStateStruct = {
                shares: ethers.parseUnits("1", 18), // 1e18
                inSupply: ethers.parseUnits("1000", 18), // 1000e18
                outRemaining: ethers.parseUnits("2000", 18), // 2000e18
                currentStreamedPrice: ethers.parseUnits("0.5", 18), // 0.5e18
                distIndex: 0,
                spentIn: 0,
                threshold: ethers.parseUnits("1000", 18), // 1000e18
                outSupply: ethers.parseUnits("2000", 18), // 2000e18
                lastUpdated: 0
            };

            const diff = 0;
            const result = await mockContract.calculateUpdatedState(state, diff);

            expect(result.shares).to.equal(state.shares);
            expect(result.inSupply).to.equal(state.inSupply);
            expect(result.outRemaining).to.equal(state.outRemaining);
            expect(result.currentStreamedPrice).to.equal(state.currentStreamedPrice);
            expect(result.distIndex).to.equal(state.distIndex);
            expect(result.spentIn).to.equal(state.spentIn);
        });

        it("should not update state if shares is 0", async function () {
            const state: IStreamTypes.StreamStateStruct = {
                shares: 0, // 0 shares
                inSupply: ethers.parseUnits("1000", 18), // 1000e18
                outRemaining: ethers.parseUnits("2000", 18), // 2000e18
                currentStreamedPrice: ethers.parseUnits("0.5", 18), // 0.5e18
                distIndex: 0,
                spentIn: 0,
                threshold: ethers.parseUnits("1000", 18), // 1000e18
                outSupply: ethers.parseUnits("2000", 18), // 2000e18
                lastUpdated: 0
            };

            const diff = ethers.parseUnits("0.5", 18); // 0.5e18
            const result = await mockContract.calculateUpdatedState(state, diff);

            expect(result.shares).to.equal(state.shares);
            expect(result.inSupply).to.equal(state.inSupply);
            expect(result.outRemaining).to.equal(state.outRemaining);
            expect(result.currentStreamedPrice).to.equal(state.currentStreamedPrice);
            expect(result.distIndex).to.equal(state.distIndex);
            expect(result.spentIn).to.equal(state.spentIn);
        });

        it("should correctly update state with 50% time diff", async function () {
            const state: IStreamTypes.StreamStateStruct = {
                shares: ethers.parseUnits("1", 18), // 1 share
                inSupply: ethers.parseUnits("1000", 18), // 1000 token
                outRemaining: ethers.parseUnits("2000", 18), // 2000 token
                currentStreamedPrice: 0,
                distIndex: 0,
                spentIn: 0,
                threshold: ethers.parseUnits("1000", 18), // 1000e18
                outSupply: ethers.parseUnits("2000", 18), // 2000e18
                lastUpdated: 0
            };

            // 50% time diff (0.5e18)
            const diff = ethers.parseUnits("0.5", 18);
            const result = await mockContract.calculateUpdatedState(state, diff);

            // Should spend 50% of inSupply: 500 tokens
            expect(result.spentIn).to.equal(ethers.parseUnits("500", 18));
            // Should have 500 tokens left in inSupply
            expect(result.inSupply).to.equal(ethers.parseUnits("500", 18));
            // Should distribute 50% of outRemaining: 1000 tokens
            expect(result.outRemaining).to.equal(ethers.parseUnits("1000", 18));
            // Index should increase by distributed amount / shares: 1000e18 / 1 = 1000e18
            expect(result.distIndex).to.equal(ethers.parseUnits("1000", 18));
            // Current price should be spentIn / distributedAmount: 500 / 1000 = 0.5
            expect(result.currentStreamedPrice).to.equal(ethers.parseUnits("0.5", 18));
        });

        it("should handle full time diff (100%)", async function () {
            const state: IStreamTypes.StreamStateStruct = {
                shares: ethers.parseUnits("1", 18), // 1 share
                inSupply: ethers.parseUnits("1000", 18), // 1000 token
                outRemaining: ethers.parseUnits("2000", 18), // 2000 token
                currentStreamedPrice: 0,
                distIndex: 0,
                spentIn: 0,
                threshold: ethers.parseUnits("1000", 18), // 1000e18
                outSupply: ethers.parseUnits("2000", 18), // 2000e18
                lastUpdated: 0
            };

            // 100% time diff (1e18)
            const diff = ethers.parseUnits("1", 18);
            const result = await mockContract.calculateUpdatedState(state, diff);

            // Should spend 100% of inSupply: 1000 tokens
            expect(result.spentIn).to.equal(ethers.parseUnits("1000", 18));
            // Should have 0 tokens left in inSupply
            expect(result.inSupply).to.equal(0);
            // Should distribute 100% of outRemaining: 2000 tokens
            expect(result.outRemaining).to.equal(0);
            // Index should increase by distributed amount / shares: 2000e18 / 1 = 2000e18
            expect(result.distIndex).to.equal(ethers.parseUnits("2000", 18));
            // Current price should be spentIn / distributedAmount: 1000 / 2000 = 0.5
            expect(result.currentStreamedPrice).to.equal(ethers.parseUnits("0.5", 18));
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

        // Test case based on Rust implementation's third case
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
    });

    describe("calculateExitFee", function () {
        it("should calculate 0 fee for 0% exit fee", async function () {
            const spentInAmount = ethers.parseUnits("1000", 18); // 1000 tokens
            // Decimal is 1e6 for precision
            const exitFeePercent = 0;
            const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, exitFeePercent);
            expect(feeAmount).to.equal(ethers.parseUnits("0", 18));
            expect(remainingAmount).to.equal(spentInAmount);
        });

        it("should calculate correct fee for 10% exit fee", async function () {
            const spentInAmount = ethers.parseUnits("1000", 18); // 1000 tokens
            const exitFeePercent = 100000;

            const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, exitFeePercent);

            // Expected fee: 1000 * 0.1 = 100 tokens
            expect(feeAmount).to.equal(ethers.parseUnits("100", 18));
            // Expected remaining: 1000 - 100 = 900 tokens
            expect(remainingAmount).to.equal(ethers.parseUnits("900", 18));
        });

        it("should handle small amounts correctly", async function () {
            const spentInAmount = 1;
            const exitFeePercent = 100000;

            const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, exitFeePercent);

            // Expected fee: 1 * 0.1 = 0.1 wei, which should be 0
            expect(feeAmount).to.equal(0);
            // Expected remaining: 1 - 0 = 1 wei
            expect(remainingAmount).to.equal(1);
        });

        it("should calculate 100% fee correctly", async function () {
            const spentInAmount = 1000;
            const exitFeePercent = 1000000; // 1.0 (100%)

            const [feeAmount, remainingAmount] = await mockContract.calculateExitFee(spentInAmount, exitFeePercent);

            // Expected fee: 1000 * 1.0 = 1000 tokens
            expect(feeAmount).to.equal(1000);
            // Expected remaining: 1000 - 1000 = 0 tokens
            expect(remainingAmount).to.equal(0);
        });
    });
    describe("syncPosition", function () {
        it("should update a position with partial distribution (75%)", async function () {
            const position: PositionTypes.PositionStruct = {
                inBalance: ethers.parseUnits("1000000", 0),
                shares: ethers.parseUnits("1000000", 0),
                index: ethers.parseUnits("0", 18),
                lastUpdateTime: 1000100,
                pendingReward: ethers.parseUnits("0", 18),
                spentIn: ethers.parseUnits("0", 0),
                purchased: ethers.parseUnits("0", 0),
                exitDate: 0
            };

            const distIndex = ethers.parseUnits("0.749993", 18);
            const shares = ethers.parseUnits("1000000", 0);
            const inSupply = ethers.parseUnits("250007", 0);
            const nowTime = 4000000;

            const result = await mockContract.syncPosition(position, distIndex, shares, inSupply, nowTime);

            expect(result.inBalance).to.equal(ethers.parseUnits("250007", 0));
            expect(result.shares).to.equal(ethers.parseUnits("1000000", 0));
            expect(result.index).to.equal(distIndex);
            expect(result.lastUpdateTime).to.equal(nowTime);
            expect(result.pendingReward).to.equal(ethers.parseUnits("0", 18));
            expect(result.spentIn).to.equal(ethers.parseUnits("749993", 0));
            expect(result.purchased).to.equal(ethers.parseUnits("749993", 0));
            expect(result.exitDate).to.equal(0);
        });

        it("should update a position to completion (100%)", async function () {
            const position: PositionTypes.PositionStruct = {
                inBalance: ethers.parseUnits("250007", 0),
                shares: ethers.parseUnits("1000000", 0),
                index: ethers.parseUnits("0.749993", 18),
                lastUpdateTime: 4000000,
                pendingReward: ethers.parseUnits("0", 18),
                spentIn: ethers.parseUnits("749993", 0),
                purchased: ethers.parseUnits("749993", 0),
                exitDate: 0
            };

            const distIndex = ethers.parseUnits("1", 18);
            const shares = ethers.parseUnits("1000000", 0);
            const inSupply = ethers.parseUnits("0", 0);
            const nowTime = 5000001;

            const result = await mockContract.syncPosition(position, distIndex, shares, inSupply, nowTime);

            expect(result.inBalance).to.equal(ethers.parseUnits("0", 0));
            expect(result.shares).to.equal(ethers.parseUnits("1000000", 0));
            expect(result.index).to.equal(distIndex);
            expect(result.lastUpdateTime).to.equal(nowTime);
            expect(result.pendingReward).to.equal(ethers.parseUnits("0", 18));
            expect(result.spentIn).to.equal(ethers.parseUnits("1000000", 0));
            expect(result.purchased).to.equal(ethers.parseUnits("1000000", 0));
            expect(result.exitDate).to.equal(0);
        });

        it("should handle zero shares case", async function () {
            const position: PositionTypes.PositionStruct = {
                inBalance: ethers.parseUnits("1000", 0),
                shares: ethers.parseUnits("0", 0),
                index: ethers.parseUnits("0.5", 18),
                lastUpdateTime: 1000000,
                pendingReward: ethers.parseUnits("0", 18),
                spentIn: ethers.parseUnits("500", 0),
                purchased: ethers.parseUnits("500", 0),
                exitDate: 0
            };

            const distIndex = ethers.parseUnits("0.75", 18);
            const shares = ethers.parseUnits("0", 0);
            const inSupply = ethers.parseUnits("250", 0);
            const nowTime = 3000000;

            const result = await mockContract.syncPosition(position, distIndex, shares, inSupply, nowTime);

            // Position should remain unchanged except for index and timestamp
            expect(result.inBalance).to.equal(position.inBalance);
            expect(result.shares).to.equal(position.shares);
            expect(result.index).to.equal(distIndex);
            expect(result.lastUpdateTime).to.equal(nowTime);
            expect(result.pendingReward).to.equal(position.pendingReward);
            expect(result.spentIn).to.equal(position.spentIn);
            expect(result.purchased).to.equal(position.purchased);
            expect(result.exitDate).to.equal(position.exitDate);
        });

        it("should ", async function () {
            const position: PositionTypes.PositionStruct = {
                inBalance: ethers.parseUnits("1000", 0),
                shares: ethers.parseUnits("1000", 0),
                index: ethers.parseUnits("0", 6),
                lastUpdateTime: 1000000,
                pendingReward: ethers.parseUnits("0", 18),
                spentIn: ethers.parseUnits("0", 0),
                purchased: ethers.parseUnits("0", 0),
                exitDate: 0
            };

            const distIndex = ethers.parseUnits("0.75", 6);
            const shares = ethers.parseUnits("0", 0);
            // diff is 0.75 - 0 = 0.75


        });
    });

});
