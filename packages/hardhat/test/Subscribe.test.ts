import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Stream, StreamFactory, ERC20Mock, PositionStorage } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";
import { stream, StreamFixtureBuilder } from "./helpers/StreamFixtureBuilder";

describe("Stream Subscribe", function () {
    describe("Basic subscription", function () {
        it("Should allow subscription during stream phase", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Subscribe with 100 tokens
            const subscriptionAmount = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

            // Get PositionStorage contract instance
            const positionStorageAddr = await contracts.stream.positionStorage();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;

            // Verify position was created correctly
            const position = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position.inBalance).to.equal(subscriptionAmount);
            expect(position.shares).to.be.gt(0);
            expect(position.spentIn).to.equal(0);
            expect(position.purchased).to.equal(0);
        });

        it("Should fail subscription during waiting phase", async function () {
            const { contracts, accounts } = await loadFixture(stream().build());

            // Try to subscribe during waiting phase
            const subscriptionAmount = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);

            await expect(
                contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount)
            ).to.be.revertedWithCustomError(contracts.stream, "InvalidStreamStatus");
        });

        it("Should fail subscription during ended phase", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to ended phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Try to subscribe during ended phase
            const subscriptionAmount = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);

            await expect(
                contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount)
            ).to.be.revertedWithCustomError(contracts.stream, "InvalidStreamStatus");
        });
    });

    describe("Multiple subscriptions", function () {
        it("Should allow multiple subscriptions from same user", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // First subscription
            const amount1 = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount1);
            await contracts.stream.connect(accounts.subscriber1).subscribe(amount1);

            // Second subscription
            const amount2 = 50;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount2);
            await contracts.stream.connect(accounts.subscriber1).subscribe(amount2);

            // Get PositionStorage contract instance
            const positionStorageAddr = await contracts.stream.positionStorage();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;

            // Verify position was updated correctly
            const position = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position.inBalance).to.equal(amount1 + amount2);
            expect(position.shares).to.be.gt(0);
        });

        it("Should allow subscriptions from multiple users", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // First user subscribes
            const amount1 = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount1);
            await contracts.stream.connect(accounts.subscriber1).subscribe(amount1);

            // Second user subscribes
            const amount2 = 50;
            await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), amount2);
            await contracts.stream.connect(accounts.subscriber2).subscribe(amount2);

            // Get PositionStorage contract instance
            const positionStorageAddr = await contracts.stream.positionStorage();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;

            // Verify positions
            const position1 = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position1.inBalance).to.equal(amount1);
            expect(position1.shares).to.be.gt(0);

            const position2 = await positionStorage.getPosition(accounts.subscriber2.address);
            expect(position2.inBalance).to.equal(amount2);
            expect(position2.shares).to.be.gt(0);
        });
    });

    describe("Edge cases", function () {
        it("Should fail with zero subscription amount", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            await expect(
                contracts.stream.connect(accounts.subscriber1).subscribe(0)
            ).to.be.revertedWithCustomError(contracts.stream, "InvalidSubscriptionAmount");
        });

        it("Should fail with insufficient allowance", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Try to subscribe without approval
            const subscriptionAmount = 100;
            await expect(
                contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount)
            ).to.be.reverted;
        });

        it("Should fail with insufficient balance", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
            await ethers.provider.send("evm_mine", []);

            // Sync the stream to update status
            await contracts.stream.syncStreamExternal();

            // Try to subscribe with more tokens than available
            const largeAmount = ethers.parseEther("1000000000"); // Very large amount
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), largeAmount);

            await expect(
                contracts.stream.connect(accounts.subscriber1).subscribe(largeAmount)
            ).to.be.reverted;
        });
    });
});
