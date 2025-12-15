/**
 * Time manipulation helpers for tests
 *
 * Abstracts common time-travel patterns used across stream tests.
 */

import { ethers } from "hardhat";
import { StreamPhase, TimeParams } from "../types";

/**
 * Advance blockchain time to a specific timestamp
 */
export async function timeTravel(timestamp: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

/**
 * Advance blockchain time by a duration (in seconds)
 */
export async function timeTravelBy(seconds: number): Promise<void> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Failed to get latest block");
  await timeTravel(block.timestamp + seconds);
}

/**
 * Mine a single block without changing timestamp
 */
export async function mineBlock(): Promise<void> {
  await ethers.provider.send("evm_mine", []);
}

/**
 * Mine multiple blocks
 */
export async function mineBlocks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await mineBlock();
  }
}

/**
 * Get current block timestamp
 */
export async function getCurrentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Failed to get latest block");
  return block.timestamp;
}

/**
 * Advance time to a specific stream phase
 *
 * @param phase - The phase to advance to
 * @param timeParams - Time parameters from fixture
 * @param offset - Optional offset in seconds after phase start (default: 1)
 */
export async function advanceToPhase(
  phase: StreamPhase,
  timeParams: TimeParams,
  offset: number = 1
): Promise<void> {
  let targetTime: number;

  switch (phase) {
    case "waiting":
      // Go to just after stream creation but before bootstrapping
      targetTime = timeParams.bootstrappingStartTime - offset;
      break;
    case "bootstrapping":
      targetTime = timeParams.bootstrappingStartTime + offset;
      break;
    case "active":
      targetTime = timeParams.streamStartTime + offset;
      break;
    case "ended":
      targetTime = timeParams.streamEndTime + offset;
      break;
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }

  await timeTravel(targetTime);
}

/**
 * Advance time to midpoint of a phase
 *
 * Useful for testing behaviors during a phase rather than at boundaries
 */
export async function advanceToMidPhase(
  phase: StreamPhase,
  timeParams: TimeParams
): Promise<void> {
  let targetTime: number;

  switch (phase) {
    case "waiting":
      targetTime = Math.floor(
        (timeParams.nowSeconds + timeParams.bootstrappingStartTime) / 2
      );
      break;
    case "bootstrapping":
      targetTime = Math.floor(
        (timeParams.bootstrappingStartTime + timeParams.streamStartTime) / 2
      );
      break;
    case "active":
      targetTime = Math.floor(
        (timeParams.streamStartTime + timeParams.streamEndTime) / 2
      );
      break;
    case "ended":
      // For ended, go 1 hour past end
      targetTime = timeParams.streamEndTime + 3600;
      break;
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }

  await timeTravel(targetTime);
}

