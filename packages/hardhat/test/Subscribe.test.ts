import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PositionStorage } from "../typechain-types";
import { stream } from "./helpers/StreamFixtureBuilder";

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
      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)
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
      expect(position.spentIn).to.equal(0);
      expect(position.purchased).to.equal(0);
    });

    it("Should allow subscription with permit 2", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)

      // Step 1: Approve Permit2 to spend maximum amount (one-time setup)
      const maxApproval = ethers.getBigInt("0xffffffffffffffffffffffffffffffffffffffff"); // type(uint160).max
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.permit2.getAddress(), maxApproval);

      // Define signature timing parameters
      const currentTime = Math.floor(Date.now() / 1000);
      const sigDeadline = currentTime + 3600; // 1 hour validity

      // Create permit details
      const permitDetails = {
        token: await contracts.inSupplyToken.getAddress(),
        amount: BigInt(subscriptionAmount), // Convert to uint160
        expiration: BigInt(sigDeadline),
        nonce: BigInt(0)
      };

      // Create permit single
      const permitSingle = {
        details: permitDetails,
        spender: await contracts.stream.getAddress(),
        sigDeadline: BigInt(sigDeadline)
      };

      // Create domain for EIP-712 signing
      const network = await ethers.provider.getNetwork();
      // Use the current network chainId for the domain separator (Permit2 runtime derives it from block.chainid)
      const chainId = Number(network.chainId);
      const domain = {
        name: "Permit2",
        chainId: chainId,
        verifyingContract: await contracts.permit2.getAddress()
      };

      // Create types for EIP-712
      const types = {
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" }
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ]
      };

      // Sign the permit
      const signature = await accounts.subscriber1.signTypedData(domain, types, permitSingle);

      // Verify signature locally (optional but useful in case of failures)
      const recoveredAddress = ethers.verifyTypedData(domain, types, permitSingle, signature);
      expect(recoveredAddress.toLowerCase()).to.equal(accounts.subscriber1.address.toLowerCase());

      // Call subscribeWithPermit directly – Permit2 permit will be executed inside the Stream contract.
      await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithPermit(
          subscriptionAmount,
          accounts.subscriber1.address,
          permitSingle,
          signature
        );
      // Verify position was created correctly
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);
      expect(position.spentIn).to.equal(0);
      expect(position.purchased).to.equal(0);
    });

    it("Should not allow subscription without approval to permit2", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // move to active stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      const subscriptionAmount = ethers.parseEther("100");

      // Build permit (owner approved but token not approved to Permit2)
      const now = Math.floor(Date.now() / 1000);
      const sigDeadline = now + 3600;

      const permitDetails = {
        token: await contracts.inSupplyToken.getAddress(),
        amount: BigInt(subscriptionAmount),
        expiration: BigInt(sigDeadline),
        nonce: BigInt(0)
      };

      const permitSingle = {
        details: permitDetails,
        spender: await contracts.stream.getAddress(),
        sigDeadline: BigInt(sigDeadline)
      };

      const domain = {
        name: "Permit2",
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        verifyingContract: await contracts.permit2.getAddress()
      };

      const types = {
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" }
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ]
      };

      const signature = await accounts.subscriber1.signTypedData(domain, types, permitSingle);

      await expect(
        contracts.stream
          .connect(accounts.subscriber1)
          .subscribeWithPermit(subscriptionAmount, accounts.subscriber1.address, permitSingle, signature)
      ).to.be.reverted; // lack of ERC20 approval for Permit2
    });

    it("Should not allow subscription with invalid signature", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      const subscriptionAmount = ethers.parseEther("100");

      // Approve token to Permit2
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.permit2.getAddress(), ethers.MaxUint256);

      const now = Math.floor(Date.now() / 1000);
      const sigDeadline = now + 3600;

      const permitDetails = {
        token: await contracts.inSupplyToken.getAddress(),
        amount: BigInt(subscriptionAmount),
        expiration: BigInt(sigDeadline),
        nonce: BigInt(0)
      };
      const permitSingle = {
        details: permitDetails,
        spender: await contracts.stream.getAddress(),
        sigDeadline: BigInt(sigDeadline)
      };
      const domain = {
        name: "Permit2",
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        verifyingContract: await contracts.permit2.getAddress()
      };
      const types = {
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" }
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ]
      };

      // Sign with the WRONG account to make signature invalid
      const invalidSignature = await accounts.subscriber2.signTypedData(domain, types, permitSingle);

      await expect(
        contracts.stream
          .connect(accounts.subscriber1)
          .subscribeWithPermit(subscriptionAmount, accounts.subscriber1.address, permitSingle, invalidSignature)
      ).to.be.reverted; // invalid signer
    });

    it("Should not allow subscription with expired permit", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await contracts.stream.syncStreamExternal();

      const subscriptionAmount = ethers.parseEther("100");

      // Approve token to Permit2
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.permit2.getAddress(), ethers.MaxUint256);

      const now = Math.floor(Date.now() / 1000);
      const sigDeadline = now - 10; // already expired

      const permitDetails = {
        token: await contracts.inSupplyToken.getAddress(),
        amount: BigInt(subscriptionAmount),
        expiration: BigInt(sigDeadline),
        nonce: BigInt(0)
      };
      const permitSingle = {
        details: permitDetails,
        spender: await contracts.stream.getAddress(),
        sigDeadline: BigInt(sigDeadline)
      };
      const domain = {
        name: "Permit2",
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        verifyingContract: await contracts.permit2.getAddress()
      };
      const types = {
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" }
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ]
      };

      const signature = await accounts.subscriber1.signTypedData(domain, types, permitSingle);

      await expect(
        contracts.stream
          .connect(accounts.subscriber1)
          .subscribeWithPermit(subscriptionAmount, accounts.subscriber1.address, permitSingle, signature)
      ).to.be.revertedWithCustomError(contracts.stream, "InvalidAmount");
    });

    it("Should fail subscription during waiting phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Try to subscribe during waiting phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime - 3]);
      await ethers.provider.send("evm_mine", []);

      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount),
      ).to.be.revertedWithCustomError(contracts.stream, "OperationNotAllowed");
    });

    it("Should allow subscription during bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to bootstrapping phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime]);
      await ethers.provider.send("evm_mine", []);

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)
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
      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount),
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
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

      // Verify position was updated correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(
        amount1 +
        amount2 -
        (amount1 *
            /* Stream duration on default is 100 seconds, first subscription is at 0 seconds  but second is at 2 second*/ 2) /
        100,
      );
    });

    it("Should allow subscriptions from multiple users", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // First user subscribes
      const amount1 = ethers.parseEther("100"); // Convert to wei (18 decimals)
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount1);
      await contracts.stream.connect(accounts.subscriber1).subscribe(amount1);

      // Second user subscribes
      const amount2 = ethers.parseEther("50"); // Convert to wei (18 decimals)
      await contracts.inSupplyToken.connect(accounts.subscriber2).approve(contracts.stream.getAddress(), amount2);
      await contracts.stream.connect(accounts.subscriber2).subscribe(amount2);

      // Get PositionStorage contract instance
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;

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

      await expect(contracts.stream.connect(accounts.subscriber1).subscribe(0)).to.be.revertedWithCustomError(
        contracts.stream,
        "InvalidAmount",
      );
    });

    it("Should fail with insufficient allowance", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Sync the stream to update status
      await contracts.stream.syncStreamExternal();

      // Try to subscribe without approval
      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)
      await expect(contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount)).to.be.reverted;
    });
  });

  describe("Subscription after full withdrawal", function () {
    it("Should allow subscription after full withdrawal during bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Fast forward time to bootstrapping phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime]);
      await ethers.provider.send("evm_mine", []);

      // Subscribe with 100 tokens
      const subscriptionAmount = ethers.parseEther("100"); // Convert to wei (18 decimals)
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Increment time
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.bootstrappingStartTime + 10]);
      await ethers.provider.send("evm_mine", []);

      // Full withdrawal
      await contracts.stream.connect(accounts.subscriber1).withdraw(subscriptionAmount);

      // Check that position is empty
      const positionStorageAddr = await contracts.stream.positionStorageAddress();
      const positionStorage = (await ethers.getContractAt("PositionStorage", positionStorageAddr)) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(0);
      expect(position.shares).to.equal(0);
      expect(position.spentIn).to.equal(0);
      expect(position.purchased).to.equal(0);
      expect(position.exitDate).to.equal(0);

      // Subscribe again
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount);

      // Check that position is updated
      const updatedPosition = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(updatedPosition.inBalance).to.equal(subscriptionAmount);
      expect(updatedPosition.shares).to.be.gt(0);
    });
  });

  describe("Native Token Subscription", function () {
    it("Should allow subscription with native token", async function () {
      const { contracts, timeParams, accounts, config } = await loadFixture(
        stream().nativeToken().setThreshold(0n).build()
      );

      // Verify we have a native token stream
      expect(config.tokenConfig.isNativeToken).to.be.true;
      expect(config.tokenConfig.inSupplyTokenAddress).to.equal(ethers.ZeroAddress);

      // Fast forward time to stream phase
      await ethers.provider.send("evm_setNextBlockTimestamp", [timeParams.streamStartTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const subscriptionAmount = ethers.parseEther("1");
      const initialBalance = await ethers.provider.getBalance(accounts.subscriber1.address);

      // Subscribe with native token using subscribeWithNativeToken
      const tx = await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithNativeToken(subscriptionAmount, { value: subscriptionAmount });

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const finalBalance = await ethers.provider.getBalance(accounts.subscriber1.address);

      // Verify native token transfer happened (balance decreased by amount + gas)
      expect(initialBalance - finalBalance).to.equal(subscriptionAmount + gasUsed);

      // Verify subscription was recorded
      const position = await contracts.stream.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.greaterThan(0);

      // Verify stream state was updated
      const streamState = await contracts.stream.getStreamState();
      expect(streamState.inSupply).to.equal(subscriptionAmount);
    });
  });
});
