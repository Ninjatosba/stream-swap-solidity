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
            const positionStorageAddr = await contracts.stream.positionStorageAddress();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;

            // Verify position was created correctly
            const position = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position.inBalance).to.equal(subscriptionAmount);
            expect(position.shares).to.be.gt(0);
            expect(position.spentIn).to.equal(0);
            expect(position.purchased).to.equal(0);
        });

        it("Should fail subscription during waiting phase", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Try to subscribe during waiting phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime - 3]);
            await ethers.provider.send("evm_mine", []);

            const subscriptionAmount = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);

            await expect(
                contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount)
            ).to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });

        it("Should allow subscription during bootstrapping phase", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to bootstrapping phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime]);
            await ethers.provider.send("evm_mine", []);

            // Subscribe with 100 tokens
            const subscriptionAmount = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

            // Get PositionStorage contract instance
            const positionStorageAddr = await contracts.stream.positionStorageAddress();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;

            // Verify position was created correctly
            const position = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position.inBalance).to.equal(subscriptionAmount);
            expect(position.shares).to.be.gt(0);
            expect(position.spentIn).to.equal(0);
            expect(position.purchased).to.equal(0);
            expect(position.exitDate).to.equal(0);

            // In bootstrapping phase, sync position with updated state
            await contracts.stream.syncStreamExternal();
            const updatedPosition = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(updatedPosition.inBalance).to.equal(subscriptionAmount);
            expect(updatedPosition.shares).to.be.gt(0);
            // No spentIn or purchased because it's not streaming yet
            expect(updatedPosition.spentIn).to.equal(0);
            expect(updatedPosition.purchased).to.equal(0);
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
            ).to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
        });
    });

    describe("Multiple subscriptions", function () {
        it("Should allow multiple subscriptions from same user", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to stream phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime]);
            await ethers.provider.send("evm_mine", []);

            // First subscription
            const amount1 = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount1);
            await contracts.stream.connect(accounts.subscriber1).subscribe(amount1);

            // Second subscription
            const amount2 = 50;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount2);
            await contracts.stream.connect(accounts.subscriber1).subscribe(amount2);

            // Get PositionStorage contract instance
            const positionStorageAddr = await contracts.stream.positionStorageAddress();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;

            // Verify position was updated correctly
            const position = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position.inBalance).to.equal((amount1 + amount2) - (amount1 * /* Stream duration on default is 100 seconds, first subscription is at 0 seconds  but second is at 2 second*/2 / 100));
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
            const positionStorageAddr = await contracts.stream.positionStorageAddress();
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
            ).to.be.revertedWithCustomError(contracts.stream, "InvalidAmount");
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

    describe("Subscription after full withdrawal", function () {
        it("Should allow subscription after full withdrawal during bootstrapping phase", async function () {
            const { contracts, timeParams, accounts } = await loadFixture(stream().build());

            // Fast forward time to bootstrapping phase
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime]);
            await ethers.provider.send("evm_mine", []);

            // Subscribe with 100 tokens
            const subscriptionAmount = 100;
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

            // Increment time
            await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 10]);
            await ethers.provider.send("evm_mine", []);

            // Full withdrawal
            await contracts.stream.connect(accounts.subscriber1).withdraw(subscriptionAmount);

            // Check that position is empty
            const positionStorageAddr = await contracts.stream.positionStorageAddress();
            const positionStorage = await ethers.getContractAt("PositionStorage", positionStorageAddr) as PositionStorage;
            const position = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(position.inBalance).to.equal(0);
            expect(position.shares).to.equal(0);
            expect(position.spentIn).to.equal(0);
            expect(position.purchased).to.equal(0);
            expect(position.exitDate).to.equal(0);

            // Subscribe again
            await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), subscriptionAmount);
            await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

            // Check that position is updated
            const updatedPosition = await positionStorage.getPosition(accounts.subscriber1.address);
            expect(updatedPosition.inBalance).to.equal(subscriptionAmount);
            expect(updatedPosition.shares).to.be.gt(0);
        });
    });
});
