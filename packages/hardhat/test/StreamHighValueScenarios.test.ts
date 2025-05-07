import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Stream, StreamFactory, ERC20Mock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";
import { stream, StreamFixtureBuilder } from "./helpers/StreamFixtureBuilder";

describe("High Value Stream Scenarios", function () {
    const HIGH_THRESHOLD = ethers.parseEther("1000000"); // 1M tokens threshold
    const LARGE_STREAM_OUT = ethers.parseEther("5000000"); // 5M tokens out supply

    describe("Large Scale Multi-Subscriber Scenario", function () {
        it("Should handle multiple high-value subscribers with position updates", async function () {
            const { contracts, timeParams, accounts, config } = await loadFixture(
                stream()
                    .setThreshold(HIGH_THRESHOLD)
                    .streamOut(LARGE_STREAM_OUT)
                    .exitRatio(0)
                    .build()
            );

            // Fast forward to bootstrapping phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
            await ethers.provider.send("evm_mine", []);
            await contracts.stream.syncStreamExternal();

            // Whale subscriber (60% of threshold)
            const whaleAmount = HIGH_THRESHOLD * BigInt(60) / BigInt(100);
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), whaleAmount);
            await contracts.stream.connect(accounts.subscriber1).subscribe(whaleAmount);

            // Large subscriber (30% of threshold)
            const largeAmount = HIGH_THRESHOLD * BigInt(40) / BigInt(100);
            await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), largeAmount);
            await contracts.stream.connect(accounts.subscriber2).subscribe(largeAmount);

            // Move to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);
            await contracts.stream.syncStreamExternal();


            // Update positions at 25% through stream
            const streamDuration = BigInt(timeParams.streamEndTime - timeParams.streamStartTime);
            const quarterStreamTime = BigInt(timeParams.streamStartTime) + (streamDuration / BigInt(4));
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(quarterStreamTime)]);
            await ethers.provider.send("evm_mine", []);
            await contracts.stream.syncStreamExternal();
            // Update positions
            await contracts.stream.connect(accounts.subscriber1).syncPosition(accounts.subscriber1.address);
            await contracts.stream.connect(accounts.subscriber2).syncPosition(accounts.subscriber2.address);

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
            expect(whale1Balance).to.be.approximately(LARGE_STREAM_OUT * BigInt(60) / BigInt(100), BigInt(ethers.parseEther("10")))
        });
    });

    describe("Vesting Scenarios", function () {
        it("Should properly vest tokens over time for different subscription levels", async function () {
            const { contracts, timeParams, accounts, } = await loadFixture(
                stream()
                    .setThreshold(HIGH_THRESHOLD)
                    .streamOut(LARGE_STREAM_OUT)
                    .beneficiaryVesting(
                        // 1 day cliff, 2 days vesting
                        24 * 60 * 60,
                        2 * 24 * 60 * 60
                    )
                    .exitRatio(0)
                    .build()
            );

            // Start at bootstrapping
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
            await ethers.provider.send("evm_mine", []);
            await contracts.stream.syncStreamExternal();

            // Two major subscribers
            const sub1Amount = HIGH_THRESHOLD * BigInt(60) / BigInt(100); // 60%
            const sub2Amount = HIGH_THRESHOLD * BigInt(40) / BigInt(100); // 40%

            // Subscribe
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), sub1Amount);
            await contracts.stream.connect(accounts.subscriber1).subscribe(sub1Amount);

            await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), sub2Amount);
            await contracts.stream.connect(accounts.subscriber2).subscribe(sub2Amount);

            // Set time to end
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);
            await contracts.stream.syncStreamExternal();

            // Exit streams at the end
            await contracts.stream.connect(accounts.subscriber1).exitStream();
            await contracts.stream.connect(accounts.subscriber2).exitStream();

            // Finalize
            await contracts.stream.connect(accounts.creator).finalizeStream();

            // Vesting contract address
            const factoryParams = await contracts.streamFactory.getParams();
            const vestingContract = await ethers.getContractAt("Vesting", factoryParams.vestingAddress);

            // Verify vesting contract
            const vestingContractBalance = await contracts.outSupplyToken.balanceOf(vestingContract.getAddress());
            expect(vestingContractBalance).to.be.equal(LARGE_STREAM_OUT);

            // Query vesting contract for sub1
            const sub1Vesting = await vestingContract.getStakesForBeneficiary(accounts.subscriber1.address, contracts.outSupplyToken.getAddress());
            expect(sub1Vesting.length).to.be.equal(1);
            expect(sub1Vesting[0].totalAmount).to.be.equal(LARGE_STREAM_OUT * BigInt(60) / BigInt(100));
            expect(sub1Vesting[0].cliffTime).to.be.equal(timeParams.streamEndTime + 60 * 60 * 24 + 3);
            expect(sub1Vesting[0].endTime).to.be.equal(timeParams.streamEndTime + 60 * 60 * 24 * 2 + 3);

            // Query vesting contract for sub2
            const sub2Vesting = await vestingContract.getStakesForBeneficiary(accounts.subscriber2.address, contracts.outSupplyToken.getAddress());
            expect(sub2Vesting.length).to.be.equal(1);
            expect(sub2Vesting[0].totalAmount).to.be.equal(LARGE_STREAM_OUT * BigInt(40) / BigInt(100));
            expect(sub2Vesting[0].cliffTime).to.be.equal(timeParams.streamEndTime + 60 * 60 * 24 + 4);
            expect(sub2Vesting[0].endTime).to.be.equal(timeParams.streamEndTime + 60 * 60 * 24 * 2 + 4);

            // Verify proportional final distribution
            // Lets say we are after vesting period
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 60 * 60 * 24 * 2 + 60 * 60 * 24]);
            await ethers.provider.send("evm_mine", []);

            // Withdraw sub1
            await vestingContract.connect(accounts.subscriber1).withdrawFunds(contracts.outSupplyToken.getAddress(), 0);
            const sub1Released = await contracts.outSupplyToken.balanceOf(accounts.subscriber1.address);

            // Withdraw sub2
            await vestingContract.connect(accounts.subscriber2).withdrawFunds(contracts.outSupplyToken.getAddress(), 0);
            const sub2Released = await contracts.outSupplyToken.balanceOf(accounts.subscriber2.address);

            // Verify sub1 has released more than sub2
            expect(sub1Released).to.be.gt(sub2Released);
            expect(sub1Released).to.be.approximately(
                LARGE_STREAM_OUT * BigInt(60) / BigInt(100),
                BigInt(ethers.parseEther("1"))
            );

            expect(sub2Released).to.be.approximately(
                LARGE_STREAM_OUT * BigInt(40) / BigInt(100),
                BigInt(ethers.parseEther("1"))
            );
        });
    });
}); 