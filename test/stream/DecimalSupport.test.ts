import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "../helpers/StreamFactoryFixtureBuilder";
import { stream } from "../helpers/StreamFixtureBuilder";
import { subscribeAndSync, advanceStreamToPhase } from "../helpers/stream";
import { TimeParams, Status } from "../types";

describe("Decimal Support", function () {
    describe("Different Decimal Combinations", function () {
        it("Should handle inSupplyToken with 6 decimals and outSupplyToken with 18 decimals", async function () {
            // Use fixture with 6 decimal input token
            const { contracts, accounts, timeParams } = await loadFixture(
                stream()
                    .inTokenDecimals(6)
                    .outTokenDecimals(18)
                    .setThreshold(ethers.parseUnits("100", 6)) // 100 tokens in 6 decimals
                    .build()
            );

            // Verify decimals are stored correctly
            const streamCore = await ethers.getContractAt("StreamCore", await contracts.stream.getAddress());
            const streamTokens = await streamCore.streamTokens();
            expect(streamTokens.inToken.decimals).to.equal(6);
            expect(streamTokens.outToken.decimals).to.equal(18);

            // Advance to active phase
            await advanceStreamToPhase(contracts.stream, "active", timeParams);

            // Subscribe with input token (6 decimals)
            const subscribeAmount = ethers.parseUnits("100", 6); // 100 tokens
            await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

            // Advance time to trigger distribution (half of stream duration)
            const streamDuration = timeParams.streamEndTime - timeParams.streamStartTime;
            await time.increase(streamDuration / 2);
            await contracts.stream.syncStreamExternal();

            const state = await contracts.stream.getStreamState();

            // Verify price calculation with decimal normalization
            // Price = normalizedSpentIn / normalizedDistributionBalance
            // spentIn is in 6 decimals, needs normalization to 18
            // distributedOut is in 18 decimals, no normalization needed
            const spentInRaw = state.spentIn; // In 6 decimals
            const distributedOutRaw = state.outSupply - state.outRemaining; // In 18 decimals

            if (distributedOutRaw > 0n) {
                // Normalize spentIn from 6 to 18 decimals
                const normalizedSpentIn = spentInRaw * 10n ** 12n; // 6 -> 18 = multiply by 10^12

                // Expected price = (normalizedSpentIn * 1e6) / distributedOutRaw
                // Price is stored as Decimal with 1e6 precision
                const expectedPriceValue = (normalizedSpentIn * 1000000n) / distributedOutRaw;

                // Allow small rounding differences (within 1% or 1000 units)
                const priceDifference = state.currentStreamedPrice.value > expectedPriceValue
                    ? state.currentStreamedPrice.value - expectedPriceValue
                    : expectedPriceValue - state.currentStreamedPrice.value;

                expect(priceDifference).to.be.lessThanOrEqual(expectedPriceValue / 100n + 1000n);
            }

            expect(state.currentStreamedPrice.value).to.be.greaterThan(0);
        });

        it("Should handle inSupplyToken with 18 decimals and outSupplyToken with 6 decimals", async function () {
            // Use fixture with 6 decimal output token
            const { contracts, accounts, timeParams } = await loadFixture(
                stream()
                    .inTokenDecimals(18)
                    .outTokenDecimals(6)
                    .streamOut(ethers.parseUnits("10000", 6)) // 10000 tokens in 6 decimals
                    .setThreshold(ethers.parseEther("5")) // 5 tokens in 18 decimals
                    .build()
            );

            // Verify decimals are stored correctly
            const streamCore = await ethers.getContractAt("StreamCore", await contracts.stream.getAddress());
            const streamTokens = await streamCore.streamTokens();
            expect(streamTokens.inToken.decimals).to.equal(18);
            expect(streamTokens.outToken.decimals).to.equal(6);

            // Advance to active phase
            await advanceStreamToPhase(contracts.stream, "active", timeParams);

            // Subscribe with input token (18 decimals)
            const subscribeAmount = ethers.parseEther("1"); // 1 token
            await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

            // Advance time significantly to get meaningful distribution
            const streamDuration = timeParams.streamEndTime - timeParams.streamStartTime;
            await time.increase(streamDuration / 2);
            await contracts.stream.syncStreamExternal();

            const state = await contracts.stream.getStreamState();

            // Verify price calculation with decimal normalization
            // spentIn is in 18 decimals (no normalization needed)
            // distributedOut is in 6 decimals, needs normalization to 18
            const spentInRaw = state.spentIn; // Already in 18 decimals
            const distributedOutRaw = state.outSupply - state.outRemaining; // In 6 decimals

            if (distributedOutRaw > 0n) {
                // Normalize distributedOut from 6 to 18 decimals
                const normalizedDistributedOut = distributedOutRaw * 10n ** 12n; // 6 -> 18 = multiply by 10^12

                // Expected price = (spentIn * 1e6) / normalizedDistributedOut
                const expectedPriceValue = (spentInRaw * 1000000n) / normalizedDistributedOut;

                // Allow small rounding differences (within 1% or 1000 units)
                const priceDifference = state.currentStreamedPrice.value > expectedPriceValue
                    ? state.currentStreamedPrice.value - expectedPriceValue
                    : expectedPriceValue - state.currentStreamedPrice.value;

                expect(priceDifference).to.be.lessThanOrEqual(expectedPriceValue / 100n + 1000n);
            }

            expect(state.currentStreamedPrice.value).to.be.greaterThan(0);
        });

        it("Should handle native token (ETH) as input with 18 decimals", async function () {
            // Use fixture with native token input
            const { contracts, accounts, timeParams } = await loadFixture(
                stream()
                    .nativeToken()
                    .outTokenDecimals(18)
                    .setThreshold(ethers.parseEther("0.5"))
                    .build()
            );

            // Verify native token decimals are set to 18
            const streamCore = await ethers.getContractAt("StreamCore", await contracts.stream.getAddress());
            const streamTokens = await streamCore.streamTokens();
            expect(streamTokens.inToken.tokenAddress).to.equal(ethers.ZeroAddress);
            expect(streamTokens.inToken.decimals).to.equal(18); // Native token should default to 18

            // Advance to active phase
            await advanceStreamToPhase(contracts.stream, "active", timeParams);

            // Subscribe with native token
            const subscribeAmount = ethers.parseEther("1");
            await contracts.stream.connect(accounts.subscriber1).subscribeWithNativeToken(subscribeAmount, [], {
                value: subscribeAmount,
            });

            // Advance time and sync
            const streamDuration = timeParams.streamEndTime - timeParams.streamStartTime;
            await time.increase(streamDuration / 2);
            await contracts.stream.syncStreamExternal();

            const state = await contracts.stream.getStreamState();
            expect(state.currentStreamedPrice.value).to.be.greaterThan(0);
        });

        it("Should correctly normalize amounts for price calculation with same decimals", async function () {
            // Use fixture with same decimals (18/18) to verify baseline calculation
            const { contracts, accounts, timeParams } = await loadFixture(
                stream()
                    .inTokenDecimals(18)
                    .outTokenDecimals(18)
                    .setThreshold(ethers.parseEther("50"))
                    .build()
            );

            // Verify decimals are stored
            const streamCore = await ethers.getContractAt("StreamCore", await contracts.stream.getAddress());
            const streamTokens = await streamCore.streamTokens();
            expect(streamTokens.inToken.decimals).to.equal(18);
            expect(streamTokens.outToken.decimals).to.equal(18);

            // Advance to active phase
            await advanceStreamToPhase(contracts.stream, "active", timeParams);

            // Subscribe
            const subscribeAmount = ethers.parseEther("100");
            await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

            // Advance time significantly to trigger distribution
            const streamDuration = timeParams.streamEndTime - timeParams.streamStartTime;
            await time.increase(streamDuration);
            await contracts.stream.syncStreamExternal();

            const state = await contracts.stream.getStreamState();

            // Verify price calculation
            // Both tokens have 18 decimals, so normalization doesn't change values
            const spentInRaw = state.spentIn;
            const distributedOutRaw = state.outSupply - state.outRemaining;

            // Expected price = (spentIn * 1e6) / distributedOut
            if (distributedOutRaw > 0n) {
                const expectedPriceValue = (spentInRaw * 1000000n) / distributedOutRaw;

                // Allow small rounding differences (within 1% or 1000 units)
                const priceDifference = state.currentStreamedPrice.value > expectedPriceValue
                    ? state.currentStreamedPrice.value - expectedPriceValue
                    : expectedPriceValue - state.currentStreamedPrice.value;

                expect(priceDifference).to.be.lessThanOrEqual(expectedPriceValue / 100n + 1000n);
            }

            expect(state.currentStreamedPrice.value).to.be.greaterThan(0);
            expect(state.spentIn).to.be.greaterThan(0);
            expect(state.outRemaining).to.be.lessThan(state.outSupply);
        });

        it("Should handle 8 decimal tokens (like WBTC)", async function () {
            // Use fixture with 8 decimal input token (like WBTC)
            const { contracts, accounts, timeParams } = await loadFixture(
                stream()
                    .inTokenDecimals(8)
                    .outTokenDecimals(18)
                    .setThreshold(ethers.parseUnits("0.1", 8)) // 0.1 WBTC
                    .build()
            );

            // Verify decimals are stored correctly
            const streamCore = await ethers.getContractAt("StreamCore", await contracts.stream.getAddress());
            const streamTokens = await streamCore.streamTokens();
            expect(streamTokens.inToken.decimals).to.equal(8);
            expect(streamTokens.outToken.decimals).to.equal(18);

            // Advance to active phase
            await advanceStreamToPhase(contracts.stream, "active", timeParams);

            // Subscribe with input token (8 decimals)
            const subscribeAmount = ethers.parseUnits("0.5", 8); // 0.5 WBTC
            await subscribeAndSync(contracts.stream, accounts.subscriber1, subscribeAmount, contracts.inSupplyToken);

            // Advance time
            const streamDuration = timeParams.streamEndTime - timeParams.streamStartTime;
            await time.increase(streamDuration / 2);
            await contracts.stream.syncStreamExternal();

            const state = await contracts.stream.getStreamState();

            // Verify price with 8 decimal normalization
            const spentInRaw = state.spentIn; // In 8 decimals
            const distributedOutRaw = state.outSupply - state.outRemaining; // In 18 decimals

            if (distributedOutRaw > 0n) {
                // Normalize spentIn from 8 to 18 decimals
                const normalizedSpentIn = spentInRaw * 10n ** 10n; // 8 -> 18 = multiply by 10^10

                const expectedPriceValue = (normalizedSpentIn * 1000000n) / distributedOutRaw;

                const priceDifference = state.currentStreamedPrice.value > expectedPriceValue
                    ? state.currentStreamedPrice.value - expectedPriceValue
                    : expectedPriceValue - state.currentStreamedPrice.value;

                expect(priceDifference).to.be.lessThanOrEqual(expectedPriceValue / 100n + 1000n);
            }

            expect(state.currentStreamedPrice.value).to.be.greaterThan(0);
        });
    });
});
