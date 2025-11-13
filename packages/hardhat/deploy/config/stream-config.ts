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

// Default configuration
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

// Predefined configurations for different scenarios
export const testnetStreamConfig: StreamConfig = {
  ...defaultStreamConfig,
  waitSeconds: 300, // 5 minutes
  bootstrappingDuration: 1800, // 30 minutes
  streamDuration: 3600, // 1 hour
  threshold: parseEther("500"),
  streamName: "Testnet Stream",
};

export const productionStreamConfig: StreamConfig = {
  ...defaultStreamConfig,
  waitSeconds: 86400, // 1 day
  bootstrappingDuration: 259200, // 3 days
  streamDuration: 604800, // 7 days
  threshold: parseEther("10000"),
  streamName: "Production Stream",
};

// Helper function to calculate timestamps
export function calculateTimestamps(
  config: StreamConfig,
  nowSeconds?: number,
): {
  bootstrappingStartTime: number;
  streamStartTime: number;
  streamEndTime: number;
} {
  const now = nowSeconds || Math.floor(Date.now() / 1000);

  // Use custom times if provided, otherwise calculate from durations
  const bootstrappingStartTime = config.customBootstrappingStartTime || now + config.waitSeconds;
  const streamStartTime = config.customStreamStartTime || bootstrappingStartTime + config.bootstrappingDuration;
  const streamEndTime = config.customStreamEndTime || streamStartTime + config.streamDuration;

  return {
    bootstrappingStartTime,
    streamStartTime,
    streamEndTime,
  };
}
