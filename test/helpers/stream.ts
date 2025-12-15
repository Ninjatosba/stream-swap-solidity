/**
 * Stream operation helpers for tests
 *
 * Common stream operations wrapped for cleaner test code.
 */

import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { StreamPhase, TimeParams } from "../types";
import { advanceToPhase } from "./time";

// Use 'any' for contract types to avoid tight coupling with typechain generated types
// The actual type checking happens at the call site
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamContract = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TokenContract = any;

/**
 * Subscribe to a stream with approval in one call
 *
 * Handles: approve → subscribe flow
 */
export async function subscribeAndSync(
  stream: StreamContract,
  subscriber: SignerWithAddress,
  amount: bigint,
  inToken: TokenContract
): Promise<void> {
  await inToken.connect(subscriber).approve(stream.getAddress(), amount);
  await stream.connect(subscriber).subscribe(amount, []);
}

/**
 * Subscribe with native token (ETH)
 */
export async function subscribeWithNativeToken(
  stream: StreamContract,
  subscriber: SignerWithAddress,
  amount: bigint
): Promise<void> {
  await stream.connect(subscriber).subscribeWithNativeToken(amount, [], { value: amount });
}

/**
 * Sync stream and advance to a specific phase
 *
 * Handles: timeTravel → sync flow
 */
export async function advanceStreamToPhase(
  stream: StreamContract,
  phase: StreamPhase,
  timeParams: TimeParams
): Promise<void> {
  await advanceToPhase(phase, timeParams);
  await stream.syncStreamExternal();
}

/**
 * Setup a stream with subscribers in a specific phase
 *
 * This is a higher-level helper that:
 * 1. Advances to the specified phase
 * 2. Syncs the stream
 * 3. Optionally subscribes with given amounts
 */
export async function setupStreamWithSubscribers(
  stream: StreamContract,
  phase: StreamPhase,
  timeParams: TimeParams,
  subscriptions: Array<{
    subscriber: SignerWithAddress;
    amount: bigint;
    inToken: TokenContract;
  }>
): Promise<void> {
  // First advance to a phase where subscription is allowed
  if (phase === "waiting") {
    throw new Error("Cannot subscribe during waiting phase");
  }

  await advanceStreamToPhase(stream, phase, timeParams);

  // Subscribe all accounts
  for (const { subscriber, amount, inToken } of subscriptions) {
    await subscribeAndSync(stream, subscriber, amount, inToken);
  }
}

/**
 * Get position with typed return
 */
export async function getPosition(
  stream: StreamContract,
  account: string | SignerWithAddress
): Promise<{
  inBalance: bigint;
  shares: bigint;
  spentIn: bigint;
  purchased: bigint;
  exitDate: bigint;
}> {
  const address = typeof account === "string" ? account : account.address;
  const position = await stream.getPosition(address);
  return {
    inBalance: position.inBalance,
    shares: position.shares,
    spentIn: position.spentIn,
    purchased: position.purchased,
    exitDate: position.exitDate,
  };
}

/**
 * Get the PositionStorage contract for a stream
 */
export async function getPositionStorage(stream: StreamContract) {
  const positionStorageAddr = await stream.positionStorageAddress();
  return await ethers.getContractAt("PositionStorage", positionStorageAddr);
}

/**
 * Assert stream is in expected status
 */
export async function expectStreamStatus(
  stream: StreamContract,
  expectedStatus: number
): Promise<void> {
  const { expect } = await import("chai");
  const status = await stream.getStreamStatus();
  expect(status).to.equal(expectedStatus);
}

