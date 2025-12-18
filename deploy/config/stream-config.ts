// packages/hardhat/deploy/config/stream-config.ts

import { BigNumberish, parseEther } from "ethers";
import { StreamTypes } from "../../typechain-types/src/StreamCore";

export interface StreamConfig {
  // Token configuration
  streamOutAmount: BigNumberish;

  // Time configuration
  waitSeconds: number;
  bootstrappingDuration: number;
  streamDuration: number;

  // Stream parameters
  threshold: BigNumberish;
  streamName: string;
  tosVersion: string;

  // Advanced configuration (optional)
  customBootstrappingStartTime?: number;
  customStreamStartTime?: number;
  customStreamEndTime?: number;
  metadata?: string;
  creatorVestingInfo: StreamTypes.VestingInfoStruct;
  beneficiaryVestingInfo: StreamTypes.VestingInfoStruct;
}

/**
 * Default stream configuration used by Hardhat tasks and examples.
 * This is intentionally generic and network-agnostic.
 */
export const defaultStreamConfig: StreamConfig = {
  // Token configuration
  streamOutAmount: parseEther("10000"),

  // Time configuration
  waitSeconds: 500,
  bootstrappingDuration: 6000,
  streamDuration: 100000,

  // Stream parameters
  threshold: parseEther("0"),
  streamName: "Test Stream",
  tosVersion: "1.0.0",

  // Advanced configuration
  metadata: "0x0000000000000000000000000000000000000000000000000000000000000000",
  creatorVestingInfo: {
    vestingDuration: 0,
    isVestingEnabled: false,
  },
  beneficiaryVestingInfo: {
    vestingDuration: 0,
    isVestingEnabled: false,
  },
};
