import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PositionStorage } from "../../typechain-types";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Amounts, Errors } from "../types";
import {
  advanceToPhase,
  timeTravel,
} from "../helpers/time";
import {
  advanceStreamToPhase,
  subscribeAndSync,
  getPositionStorage,
} from "../helpers/stream";
import { getBalance } from "../helpers/balances";

describe("Stream Subscribe", function () {
  describe("Basic subscription", function () {
    it("Should allow subscription during stream phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with 100 tokens
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

      // Get PositionStorage contract instance
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;

      // Verify position was created correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);
      expect(position.spentIn).to.equal(0);
      expect(position.purchased).to.equal(0);
    });

    it("Should allow subscription with permit 2", async function () {
      // Enable vesting and pool to force StreamFull (which has subscribeWithPermit)
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .creatorVesting(100)
          .poolOutSupply(Amounts.DEFAULT_THRESHOLD)
          .enablePoolCreation(true)
          .build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;

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
        amount: BigInt(subscriptionAmount),
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

      // Verify signature locally
      const recoveredAddress = ethers.verifyTypedData(domain, types, permitSingle, signature);
      expect(recoveredAddress.toLowerCase()).to.equal(accounts.subscriber1.address.toLowerCase());

      // Call subscribeWithPermit
      await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithPermit(
          subscriptionAmount,
          accounts.subscriber1.address,
          permitSingle,
          signature,
          []
        );

      // Verify position was created correctly
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);
      expect(position.spentIn).to.equal(0);
      expect(position.purchased).to.equal(0);
    });

    it("Should not allow subscription without approval to permit2", async function () {
      // Enable vesting and pool to force StreamFull (which has subscribeWithPermit)
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .creatorVesting(100)
          .poolOutSupply(Amounts.DEFAULT_THRESHOLD)
          .enablePoolCreation(true)
          .build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;

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
          .subscribeWithPermit(subscriptionAmount, accounts.subscriber1.address, permitSingle, signature, [])
      ).to.be.reverted; // lack of ERC20 approval for Permit2
    });

    it("Should not allow subscription with invalid signature", async function () {
      // Enable vesting and pool to force StreamFull (which has subscribeWithPermit)
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .creatorVesting(100)
          .poolOutSupply(Amounts.DEFAULT_THRESHOLD)
          .enablePoolCreation(true)
          .build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;

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
          .subscribeWithPermit(subscriptionAmount, accounts.subscriber1.address, permitSingle, invalidSignature, [])
      ).to.be.reverted; // invalid signer
    });

    it("Should not allow subscription with expired permit", async function () {
      // Enable vesting and pool to force StreamFull (which has subscribeWithPermit)
      const { contracts, timeParams, accounts } = await loadFixture(
        stream()
          .creatorVesting(100)
          .poolOutSupply(Amounts.DEFAULT_THRESHOLD)
          .enablePoolCreation(true)
          .build()
      );

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;

      // Approve token to Permit2
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.permit2.getAddress(), ethers.MaxUint256);

      // Get current block timestamp and set sigDeadline to be expired (in the past)
      const currentBlockTimestamp = BigInt(await ethers.provider.getBlock("latest").then(b => b!.timestamp));
      const sigDeadline = currentBlockTimestamp - 10n; // already expired

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
          .subscribeWithPermit(subscriptionAmount, accounts.subscriber1.address, permitSingle, signature, [])
      ).to.be.revertedWithCustomError(contracts.stream, Errors.InvalidAmount);
    });

    it("Should fail subscription during waiting phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to waiting phase (before bootstrapping)
      await advanceToPhase("waiting", timeParams, 3);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, []),
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });

    it("Should allow subscription during bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to bootstrapping phase (offset 0 to land exactly at start)
      await advanceToPhase("bootstrapping", timeParams, 0);

      // Subscribe with 100 tokens
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

      // Get PositionStorage contract instance
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;

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

      // Advance to ended phase and sync
      await advanceStreamToPhase(contracts.stream, "ended", timeParams);

      // Try to subscribe during ended phase
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, []),
      ).to.be.revertedWithCustomError(contracts.stream, Errors.OperationNotAllowed);
    });
  });

  describe("Multiple subscriptions", function () {
    it("Should allow multiple subscriptions from same user", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to active phase (offset 0 to land exactly at start)
      await advanceToPhase("active", timeParams, 0);

      // First subscription
      const amount1 = 100n;
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount1);
      await contracts.stream.connect(accounts.subscriber1).subscribe(amount1, []);

      // Second subscription
      const amount2 = 50n;
      await contracts.inSupplyToken.connect(accounts.subscriber1).approve(contracts.stream.getAddress(), amount2);
      await contracts.stream.connect(accounts.subscriber1).subscribe(amount2, []);

      // Get PositionStorage contract instance
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;

      // Verify position was updated correctly
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      // Stream duration is 100 seconds, first subscription at 0s, second at 2s
      // So amount1 loses 2% during those 2 seconds
      expect(position.inBalance).to.equal(amount1 + amount2 - (amount1 * 2n) / 100n);
    });

    it("Should allow subscriptions from multiple users", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // First user subscribes
      const amount1 = Amounts.DEFAULT_SUBSCRIPTION;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, amount1, contracts.inSupplyToken);

      // Second user subscribes
      const amount2 = ethers.parseEther("50");
      await subscribeAndSync(contracts.stream, accounts.subscriber2, amount2, contracts.inSupplyToken);

      // Get PositionStorage contract instance
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;

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

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(0, [])
      ).to.be.revertedWithCustomError(contracts.stream, Errors.InvalidAmount);
    });

    it("Should fail with insufficient allowance", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Try to subscribe without approval
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, [])
      ).to.be.reverted;
    });
  });

  describe("Subscription after full withdrawal", function () {
    it("Should allow subscription after full withdrawal during bootstrapping phase", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to bootstrapping phase (offset 0)
      await advanceToPhase("bootstrapping", timeParams, 0);

      // Subscribe with 100 tokens
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

      // Increment time by 10 seconds
      await timeTravel(timeParams.bootstrappingStartTime + 10);

      // Full withdrawal
      await contracts.stream.connect(accounts.subscriber1).withdraw(subscriptionAmount);

      // Check that position is empty
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(0);
      expect(position.shares).to.equal(0);
      expect(position.spentIn).to.equal(0);
      expect(position.purchased).to.equal(0);
      expect(position.exitDate).to.equal(0);

      // Subscribe again
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

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

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.SMALL_AMOUNT;
      const initialBalance = await getBalance("native", accounts.subscriber1);

      // Subscribe with native token using subscribeWithNativeToken
      const tx = await contracts.stream
        .connect(accounts.subscriber1)
        .subscribeWithNativeToken(subscriptionAmount, [], { value: subscriptionAmount });

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const finalBalance = await getBalance("native", accounts.subscriber1);

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
  describe("Subscription with whitelist", function () {
    it("Should allow subscription with valid proof for whitelisted user (first subscription)", async function () {
      const signers = await ethers.getSigners();
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address, signers[3].address, signers[4].address)
          .build()
      );
      const { contracts, timeParams, accounts, whitelist } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Verify whitelist is enabled
      const whitelistRoot = await contracts.stream.whitelistRoot();
      expect(whitelistRoot).to.not.equal(ethers.ZeroHash);
      expect(whitelist.root).to.equal(whitelistRoot);

      // Subscribe with valid proof
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      const proof = whitelist.getProof!(accounts.subscriber1.address);

      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, proof);

      // Verify position was created
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);
    });

    it("Should reject subscription without proof for whitelisted user (first subscription)", async function () {
      const signers = await ethers.getSigners();
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address, signers[3].address)
          .build()
      );
      const { contracts, timeParams, accounts } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      // Try to subscribe without proof
      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, [])
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
    });

    it("Should reject subscription with invalid proof for whitelisted user", async function () {
      const signers = await ethers.getSigners();
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address, signers[3].address)
          .build()
      );
      const { contracts, timeParams, accounts, whitelist } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      // Get proof for subscriber2 but use it for subscriber1
      const wrongProof = whitelist.getProof!(accounts.subscriber2.address);

      // Try to subscribe with wrong proof
      await expect(
        contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, wrongProof)
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
    });

    it("Should reject subscription for non-whitelisted user", async function () {
      const signers = await ethers.getSigners();
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address, signers[3].address)
          .build()
      );
      const { contracts, timeParams, accounts } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // subscriber3 is not in whitelist
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await contracts.inSupplyToken
        .connect(accounts.subscriber3)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      // Try to subscribe with empty proof (non-whitelisted user)
      await expect(
        contracts.stream.connect(accounts.subscriber3).subscribe(subscriptionAmount, [])
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
    });

    it("Should allow subsequent subscriptions without proof for whitelisted user (already has position)", async function () {
      const signers = await ethers.getSigners();
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address, signers[3].address)
          .build()
      );
      const { contracts, timeParams, accounts, whitelist } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // First subscription with proof
      const firstAmount = Amounts.DEFAULT_SUBSCRIPTION;
      const proof = whitelist.getProof!(accounts.subscriber1.address);

      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), firstAmount * 2n);

      await contracts.stream.connect(accounts.subscriber1).subscribe(firstAmount, proof);

      // Second subscription without proof (should work because user already has position)
      const secondAmount = ethers.parseEther("50");
      await contracts.stream.connect(accounts.subscriber1).subscribe(secondAmount, []);

      // Verify position was updated
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      // Note: inBalance might be slightly less due to stream progression
      expect(position.inBalance).to.be.gte(secondAmount);
    });

    it("Should allow multiple whitelisted users to subscribe", async function () {
      const signers = await ethers.getSigners();
      // Fixture builder order: [deployer, creator, subscriber1, subscriber2, subscriber3, subscriber4, protocolAdmin, feeCollector]
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address, signers[3].address, signers[4].address)
          .build()
      );
      const { contracts, timeParams, accounts, whitelist } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;

      // Subscribe subscriber1
      const proof1 = whitelist.getProof!(accounts.subscriber1.address);
      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, proof1);

      // Subscribe subscriber2
      const proof2 = whitelist.getProof!(accounts.subscriber2.address);
      await contracts.inSupplyToken
        .connect(accounts.subscriber2)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber2).subscribe(subscriptionAmount, proof2);

      // Subscribe subscriber3
      const proof3 = whitelist.getProof!(accounts.subscriber3.address);
      await contracts.inSupplyToken
        .connect(accounts.subscriber3)
        .approve(contracts.stream.getAddress(), subscriptionAmount);
      await contracts.stream.connect(accounts.subscriber3).subscribe(subscriptionAmount, proof3);

      // Verify all positions
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;

      const position1 = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position1.inBalance).to.equal(subscriptionAmount);

      const position2 = await positionStorage.getPosition(accounts.subscriber2.address);
      expect(position2.inBalance).to.equal(subscriptionAmount);

      const position3 = await positionStorage.getPosition(accounts.subscriber3.address);
      expect(position3.inBalance).to.equal(subscriptionAmount);
    });

    it("Should work like public stream when whitelist root is zero", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Verify whitelist root is zero
      const whitelistRoot = await contracts.stream.whitelistRoot();
      expect(whitelistRoot).to.equal(ethers.ZeroHash);

      // Subscribe without proof (should work for public stream)
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

      // Verify position was created
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
    });

    it("Should allow subscription with single address whitelist", async function () {
      const signers = await ethers.getSigners();  // Fixture builder order: [deployer, creator, subscriber1, subscriber2, subscriber3, subscriber4, protocolAdmin, feeCollector]
      const fixture = await loadFixture(
        stream()
          .whitelist(signers[2].address)
          .build()
      );
      const { contracts, timeParams, accounts, whitelist } = fixture;

      // Advance to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      const proof = whitelist.getProof!(accounts.subscriber1.address);

      await contracts.inSupplyToken
        .connect(accounts.subscriber1)
        .approve(contracts.stream.getAddress(), subscriptionAmount);

      await contracts.stream.connect(accounts.subscriber1).subscribe(subscriptionAmount, proof);

      // Verify position was created
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
      expect(position.shares).to.be.gt(0);
    });
  });

  describe("Subscription fee", function () {
    it("Should collect subscription fee when subscriptionFeeRatio is set", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Set subscription fee ratio to 2% (20000 in decimal format with 1e6 precision)
      const subscriptionFeeRatio = { value: 20000n }; // 2% = 0.02 * 1e6
      await contracts.streamFactory
        .connect(accounts.protocolAdmin)
        .updateSubscriptionFeeRatio(subscriptionFeeRatio);

      // Advance to active phase
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with 100 tokens
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      const tokenForBalance = contracts.inSupplyToken || "native";
      const feeCollectorBalanceBefore = await getBalance(tokenForBalance, accounts.feeCollector);
      const streamAddress = await contracts.stream.getAddress();
      const streamBalanceBefore = await getBalance(tokenForBalance, streamAddress);

      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

      // Calculate expected fee (2% of 100 = 2 tokens)
      // Using the same calculation as calculateExitFee: floor(amount * ratio)
      const expectedFee = (subscriptionAmount * subscriptionFeeRatio.value) / 1000000n;
      const expectedSubscriptionAmount = subscriptionAmount - expectedFee;

      // Verify fee collector received the fee
      const feeCollectorBalanceAfter = await getBalance(tokenForBalance, accounts.feeCollector);
      expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(expectedFee);

      // Verify stream received the remaining amount (after fee)
      const streamBalanceAfter = await getBalance(tokenForBalance, streamAddress);
      expect(streamBalanceAfter - streamBalanceBefore).to.equal(expectedSubscriptionAmount);

      // Verify position was created with the subscription amount (after fee)
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(expectedSubscriptionAmount);
      expect(position.shares).to.be.gt(0);
    });

    it("Should not collect fee when subscriptionFeeRatio is zero", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Ensure subscription fee ratio is zero (default)
      const factoryParams = await contracts.streamFactory.getParams();
      expect(factoryParams.subscriptionFeeRatio.value).to.equal(0n);

      // Advance to active phase
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Subscribe with 100 tokens
      const subscriptionAmount = Amounts.DEFAULT_SUBSCRIPTION;
      const tokenForBalance = contracts.inSupplyToken || "native";
      const feeCollectorBalanceBefore = await getBalance(tokenForBalance, accounts.feeCollector);
      const streamAddress = await contracts.stream.getAddress();
      const streamBalanceBefore = await getBalance(tokenForBalance, streamAddress);

      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount, contracts.inSupplyToken);

      // Verify fee collector did not receive any fee
      const feeCollectorBalanceAfter = await getBalance(tokenForBalance, accounts.feeCollector);
      expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(0n);

      // Verify stream received the full amount
      const streamBalanceAfter = await getBalance(tokenForBalance, streamAddress);
      expect(streamBalanceAfter - streamBalanceBefore).to.equal(subscriptionAmount);

      // Verify position was created with the full subscription amount
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position = await positionStorage.getPosition(accounts.subscriber1.address);
      expect(position.inBalance).to.equal(subscriptionAmount);
    });

    it("Should collect correct fee for multiple subscriptions", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      // Set subscription fee ratio to 1% (10000 in decimal format with 1e6 precision)
      const subscriptionFeeRatio = { value: 10000n }; // 1% = 0.01 * 1e6
      await contracts.streamFactory
        .connect(accounts.protocolAdmin)
        .updateSubscriptionFeeRatio(subscriptionFeeRatio);

      // Advance to active phase
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // First subscription: 100 tokens
      const subscriptionAmount1 = Amounts.DEFAULT_SUBSCRIPTION;
      const expectedFee1 = (subscriptionAmount1 * subscriptionFeeRatio.value) / 1000000n;
      const expectedSubscriptionAmount1 = subscriptionAmount1 - expectedFee1;

      await subscribeAndSync(contracts.stream, accounts.subscriber1, subscriptionAmount1, contracts.inSupplyToken);

      // Second subscription: 200 tokens
      const subscriptionAmount2 = ethers.parseEther("200");
      const expectedFee2 = (subscriptionAmount2 * subscriptionFeeRatio.value) / 1000000n;
      const expectedSubscriptionAmount2 = subscriptionAmount2 - expectedFee2;

      const tokenForBalance = contracts.inSupplyToken || "native";
      const feeCollectorBalanceBefore = await getBalance(tokenForBalance, accounts.feeCollector);
      await subscribeAndSync(contracts.stream, accounts.subscriber2, subscriptionAmount2, contracts.inSupplyToken);

      // Verify fee collector received the second fee
      const feeCollectorBalanceAfter = await getBalance(tokenForBalance, accounts.feeCollector);
      expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(expectedFee2);

      // Verify positions
      const positionStorage = await getPositionStorage(contracts.stream) as PositionStorage;
      const position1 = await positionStorage.getPosition(accounts.subscriber1.address);
      const position2 = await positionStorage.getPosition(accounts.subscriber2.address);

      expect(position1.inBalance).to.equal(expectedSubscriptionAmount1);
      expect(position2.inBalance).to.equal(expectedSubscriptionAmount2);
    });

    it("Should emit SubscriptionFeeRatioUpdated event when updated", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      const newSubscriptionFeeRatio = { value: 15000n }; // 1.5%

      const tx = await contracts.streamFactory
        .connect(accounts.protocolAdmin)
        .updateSubscriptionFeeRatio(newSubscriptionFeeRatio);

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (log: any) => log.topics[0] === contracts.streamFactory.interface.getEvent("SubscriptionFeeRatioUpdated").topicHash,
      );

      expect(event).to.not.be.undefined;
      if (!event) throw new Error("Event not found");
      const parsedEvent = contracts.streamFactory.interface.parseLog({
        topics: event.topics,
        data: event.data,
      });

      expect(parsedEvent?.args.oldRatio).to.equal(0n);
      expect(parsedEvent?.args.newRatio).to.equal(newSubscriptionFeeRatio.value);
    });
  });
});
