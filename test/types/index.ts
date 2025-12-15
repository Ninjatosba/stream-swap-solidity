/**
 * Shared test types, enums, and constants
 *
 * This file contains test-specific types that complement the auto-generated
 * typechain types. Use this for enums, test constants, and helper types.
 */

import { ethers } from "hardhat";

// =============================================================================
// ENUMS (matching contract definitions)
// =============================================================================

/**
 * Stream status enum - matches StreamTypes.Status from contract
 */
export enum Status {
  Waiting = 0,
  Bootstrapping = 1,
  Active = 2,
  Ended = 3,
  FinalizedRefunded = 4,
  FinalizedStreamed = 5,
  Cancelled = 6,
}

/**
 * DEX type enum - matches StreamTypes.DexType from contract
 */
export enum DexType {
  V2 = 0,
  V3 = 1,
  Aerodrome = 2,
}

// =============================================================================
// TYPE ALIASES
// =============================================================================

/**
 * Stream phase names for readability in tests
 */
export type StreamPhase = "waiting" | "bootstrapping" | "active" | "ended";

/**
 * Map StreamPhase to Status enum
 */
export const PhaseToStatus: Record<StreamPhase, Status> = {
  waiting: Status.Waiting,
  bootstrapping: Status.Bootstrapping,
  active: Status.Active,
  ended: Status.Ended,
};

// =============================================================================
// TEST CONSTANTS
// =============================================================================

/**
 * Default amounts used across tests
 */
export const Amounts = {
  DEFAULT_THRESHOLD: ethers.parseEther("100"),
  DEFAULT_STREAM_OUT: ethers.parseEther("1000"),
  DEFAULT_SUBSCRIPTION: ethers.parseEther("100"),
  LARGE_AMOUNT: ethers.parseEther("1000000"),
  SMALL_AMOUNT: ethers.parseEther("1"),
  ZERO: 0n,
} as const;

/**
 * Default time durations in seconds
 */
export const Durations = {
  ONE_HOUR: 3600,
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
  DEFAULT_WAIT: 50,
  DEFAULT_BOOTSTRAPPING: 50,
  DEFAULT_STREAM: 100,
} as const;

// =============================================================================
// ERROR NAMES (for revert checks)
// =============================================================================

/**
 * Common error names from contracts for use with revertedWithCustomError
 */
export const Errors = {
  // Stream errors
  OperationNotAllowed: "OperationNotAllowed",
  InvalidAmount: "InvalidAmount",
  InvalidAddress: "InvalidAddress",
  InsufficientBalance: "InsufficientBalance",
  AlreadyExited: "AlreadyExited",
  NotSubscribed: "NotSubscribed",
  StreamNotEnded: "StreamNotEnded",
  ThresholdNotReached: "ThresholdNotReached",

  // Factory errors
  ContractFrozen: "ContractFrozen",
  StreamInputTokenNotAccepted: "StreamInputTokenNotAccepted",
  ZeroOutSupplyNotAllowed: "ZeroOutSupplyNotAllowed",
  InvalidBootstrappingStartTime: "InvalidBootstrappingStartTime",
  InvalidStreamStartTime: "InvalidStreamStartTime",
  InvalidStreamEndTime: "InvalidStreamEndTime",
  InvalidDuration: "InvalidDuration",
  InvalidToSVersion: "InvalidToSVersion",
  InvalidCreator: "InvalidCreator",
  InvalidOutSupplyToken: "InvalidOutSupplyToken",
  SameInputAndOutputToken: "SameInputAndOutputToken",
  InvalidVestingDuration: "InvalidVestingDuration",
  WaitingDurationTooShort: "WaitingDurationTooShort",
  BootstrappingDurationTooShort: "BootstrappingDurationTooShort",
  StreamDurationTooShort: "StreamDurationTooShort",
  IncorrectNativeAmount: "IncorrectNativeAmount",
  PoolRouterNotSet: "PoolRouterNotSet",
  InvalidPoolOutSupplyAmount: "InvalidPoolOutSupplyAmount",

  // Pool wrapper errors
  DifferentTokensRequired: "DifferentTokensRequired",
} as const;

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Time parameters returned by fixture builders
 */
export interface TimeParams {
  bootstrappingStartTime: number;
  streamStartTime: number;
  streamEndTime: number;
  nowSeconds: number;
}

/**
 * Balance snapshot for before/after comparisons
 */
export interface BalanceSnapshot {
  [key: string]: bigint;
}

