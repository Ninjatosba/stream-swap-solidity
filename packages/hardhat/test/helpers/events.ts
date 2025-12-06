import { ethers } from "hardhat";
import { ContractTransactionReceipt } from "ethers";

// Event interfaces for common stream events
export const EventInterfaces = {
  PoolCreated: new ethers.Interface([
    "event PoolCreated(address indexed streamAddress, address indexed poolAddress, address token0, address token1, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1, address indexed creator)"
  ]),
  FinalizedStreamed: new ethers.Interface([
    "event FinalizedStreamed(address indexed streamAddress, address indexed creator, uint256 creatorRevenue, uint256 exitFeeAmount, uint256 refundedOutAmount)"
  ]),
  VestingWalletCreated: new ethers.Interface([
    "event VestingWalletCreated(address indexed beneficiary, address indexed vestingWallet, uint64 startTime, uint64 duration, address token, uint256 amount)"
  ]),
};

// Event topics for log filtering
export const EventTopics = {
  PoolCreated: ethers.id("PoolCreated(address,address,address,address,uint256,uint256,uint256,uint256,address)"),
  FinalizedStreamed: ethers.id("FinalizedStreamed(address,address,uint256,uint256,uint256)"),
  VestingWalletCreated: ethers.id("VestingWalletCreated(address,address,uint64,uint64,address,uint256)"),
};

export interface PoolCreatedEvent {
  streamAddress: string;
  poolAddress: string;
  token0: string;
  token1: string;
  amount0: bigint;
  amount1: bigint;
  refundedAmount0: bigint;
  refundedAmount1: bigint;
  creator: string;
}

export interface FinalizedStreamedEvent {
  streamAddress: string;
  creator: string;
  creatorRevenue: bigint;
  exitFeeAmount: bigint;
  refundedOutAmount: bigint;
}

export interface VestingWalletCreatedEvent {
  beneficiary: string;
  vestingWallet: string;
  startTime: bigint;
  duration: bigint;
  token: string;
  amount: bigint;
}

/**
 * Get PoolCreated event from a transaction receipt
 */
export async function getPoolCreatedEvent(
  receipt: ContractTransactionReceipt,
  streamAddress: string
): Promise<PoolCreatedEvent | null> {
  const logs = await ethers.provider.getLogs({
    address: streamAddress,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
    topics: [EventTopics.PoolCreated]
  });

  if (logs.length === 0) return null;

  const parsed = EventInterfaces.PoolCreated.parseLog(logs[0]);
  if (!parsed) return null;

  return {
    streamAddress: parsed.args.streamAddress,
    poolAddress: parsed.args.poolAddress,
    token0: parsed.args.token0,
    token1: parsed.args.token1,
    amount0: parsed.args.amount0,
    amount1: parsed.args.amount1,
    refundedAmount0: parsed.args.refundedAmount0,
    refundedAmount1: parsed.args.refundedAmount1,
    creator: parsed.args.creator,
  };
}

/**
 * Get FinalizedStreamed event from a transaction receipt
 */
export async function getFinalizedStreamedEvent(
  receipt: ContractTransactionReceipt,
  streamAddress: string
): Promise<FinalizedStreamedEvent | null> {
  const logs = await ethers.provider.getLogs({
    address: streamAddress,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
    topics: [EventTopics.FinalizedStreamed]
  });

  if (logs.length === 0) return null;

  const parsed = EventInterfaces.FinalizedStreamed.parseLog(logs[0]);
  if (!parsed) return null;

  return {
    streamAddress: parsed.args.streamAddress,
    creator: parsed.args.creator,
    creatorRevenue: parsed.args.creatorRevenue,
    exitFeeAmount: parsed.args.exitFeeAmount,
    refundedOutAmount: parsed.args.refundedOutAmount,
  };
}

/**
 * Get VestingWalletCreated event from a transaction receipt
 */
export async function getVestingWalletCreatedEvent(
  receipt: ContractTransactionReceipt,
  vestingFactoryAddress: string
): Promise<VestingWalletCreatedEvent | null> {
  const logs = await ethers.provider.getLogs({
    address: vestingFactoryAddress,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
    topics: [EventTopics.VestingWalletCreated]
  });

  if (logs.length === 0) return null;

  const parsed = EventInterfaces.VestingWalletCreated.parseLog(logs[0]);
  if (!parsed) return null;

  return {
    beneficiary: parsed.args.beneficiary,
    vestingWallet: parsed.args.vestingWallet,
    startTime: parsed.args.startTime,
    duration: parsed.args.duration,
    token: parsed.args.token,
    amount: parsed.args.amount,
  };
}

