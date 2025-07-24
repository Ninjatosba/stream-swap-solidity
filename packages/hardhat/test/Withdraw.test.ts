import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PositionStorage } from "../typechain-types";
import { stream } from "./helpers/StreamFixtureBuilder";

describe("Stream Withdraw", function () {
  describe("Basic withdrawal", function () {
    it("Should allow withdrawal during stream phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = 100;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Get PositionStorage contract instance
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      // Verify position was created correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);

      // Withdraw 50 tokens
      const withdrawAmount = 50;
      const inBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
      await contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount);
      const inBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
      expect(inBalanceAfter - inBalanceBefore).to.equal(withdrawAmount);

      // Sync the position
      await contracts.stream.syncPositionExternal(accounts.subscriber1.address);

      // Verify position was updated correctly
      const updatedPosition = await positionStorage.getPosition(accounts.subscriber1.address);
      // Some tokens are spent in between operations
      expect(updatedPosition.inBalance).to.lt(subscriptionAmount - withdrawAmount);
      expect(updatedPosition.shares).to.be.gt(0);
      expect(updatedPosition.spentIn).to.be.gt(0);
      expect(updatedPosition.purchased).to.be.gt(0);
    });

    it("Should fail withdrawal during ended phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = 100;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Fast forward time to ended phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamEndTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Try to withdraw during ended phase
      const withdrawAmount = 50;
      await expect(
        contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount),
      ).to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
    });
  });

  describe("Multiple withdrawals", function () {
    it("Should allow multiple withdrawals from same user", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Query in balance of subscriber1
      const inBalanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);

      // First withdrawal
      const withdrawAmount1 = ethers.parseEther("30");
      await contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount1);

      // Second withdrawal
      const withdrawAmount2 = ethers.parseEther("20");
      await contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount2);

      // Get PositionStorage contract instance
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      // Verify position was updated correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.lt(subscriptionAmount - withdrawAmount1 - withdrawAmount2);
      expect(position.shares).to.be.gt(0);
      expect(position.spentIn).to.be.gt(0);
      expect(position.purchased).to.be.gt(0);

      // Verify in balance of subscriber1
      const inBalanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
      expect(inBalanceAfter - inBalanceBefore).to.equal(withdrawAmount1 + withdrawAmount2);
    });
  });

  describe("Edge cases", function () {
    it("Should allow full withdrawal with zero amount", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to bootstrapping phase (not active phase to avoid token spending)
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Get balance before withdrawal
      const balanceBefore = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);

      // Withdraw all tokens by passing 0
      await contracts.stream.connect(accounts.subscriber1).withdraw(0);

      // Verify all tokens were withdrawn
      const balanceAfter = await contracts.inSupplyToken.balanceOf(accounts.subscriber1.address);
      expect(balanceAfter - balanceBefore).to.equal(subscriptionAmount);

      // Verify position is now empty
      const position = await contracts.stream.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(0);
      expect(position.shares).to.equal(0);
    });

    it("Should handle full withdrawal when balance is zero", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Try to withdraw 0 when user has no position
      await expect(
        contracts.stream.connect(accounts.subscriber1).withdraw(0)
      ).to.be.revertedWithCustomError(contracts.stream, "InvalidPosition");
    });

    it("Should fail with withdrawal amount exceeding balance", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Try to withdraw more than subscribed
      const withdrawAmount = subscriptionAmount + ethers.parseEther("1");
      await expect(
        contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount),
      ).to.be.revertedWithCustomError(contracts.stream, "WithdrawAmountExceedsBalance");
    });

    it("Should fail withdrawal with invalid position", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Try to withdraw without subscribing
      const withdrawAmount = ethers.parseEther("50");
      await expect(
        contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount),
      ).to.be.revertedWithCustomError(contracts.stream, "InvalidPosition");
    });
  });

  describe("Withdraw in bootstrapping phase", function () {
    it("Should allow withdrawal in bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to bootstrapping phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Get PositionStorage contract instance
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      // Verify position was created correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);

      // Withdraw 50 tokens
      const withdrawAmount = ethers.parseEther("50");
      await contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount);

      // Verify position was updated correctly
      const updatedPosition = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(updatedPosition.inBalance).to.equal(subscriptionAmount - withdrawAmount);
    });

    it("Full withdrawal in bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to bootstrapping phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Get PositionStorage contract instance
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      // Verify position was created correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);

      // Full withdrawal
      await contracts.stream.connect(accounts.subscriber1).withdraw(subscriptionAmount);

      // Verify position was updated correctly
      const updatedPosition = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(updatedPosition.inBalance).to.equal(0);
      expect(updatedPosition.shares).to.equal(0);
    });
  });

  describe("Event emission", function () {
    it("Should emit Withdrawn event with correct parameters", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100");
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Get PositionStorage contract instance
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      // Verify position was created correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);

      // Withdraw 50 tokens
      const withdrawAmount = ethers.parseEther("50");
      const withdrawTx = await contracts.stream.connect(accounts.subscriber1).withdraw(withdrawAmount);
      const receipt = await withdrawTx.wait();

      // Find the Withdrawn event
      const withdrawnEvent = receipt?.logs.find(
        log => log.topics[0] === contracts.stream.interface.getEvent("Withdrawn").topicHash,
      );

      expect(withdrawnEvent).to.not.be.undefined;

      // Parse the event
      const parsedEvent = contracts.stream.interface.parseLog({
        topics: withdrawnEvent?.topics || [],
        data: withdrawnEvent?.data || "",
      });

      // Verify event parameters
      expect(parsedEvent?.args.streamAddress).to.equal(await contracts.stream.getAddress());
      expect(parsedEvent?.args.subscriber).to.equal(accounts.subscriber1.address);
      expect(parsedEvent?.args.positionInBalance).to.lt(subscriptionAmount - withdrawAmount);
      expect(parsedEvent?.args.positionShares).to.be.gt(0);
      expect(parsedEvent?.args.positionLastUpdateTime).to.be.gt(0);
      expect(parsedEvent?.args.positionSpentIn).to.be.gt(0);
      expect(parsedEvent?.args.positionPurchased).to.be.gt(0);
      expect(parsedEvent?.args.streamInSupply).to.be.gt(0);
      expect(parsedEvent?.args.streamShares).to.be.gt(0);
    });
  });
});
