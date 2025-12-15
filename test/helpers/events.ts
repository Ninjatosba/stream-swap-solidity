import { ethers } from "hardhat";
import { ContractTransactionReceipt } from "ethers";

// Event interfaces for common stream events
export const EventInterfaces = {
  StreamCreated: new ethers.Interface([
    "event StreamCreated(address indexed streamFactoryAddress, address streamOutToken, address streamInToken, uint8 inTokenDecimals, uint8 outTokenDecimals, address streamAddress, address creator, address positionStorageAddress, uint256 streamOutAmount, uint256 poolOutSupplyAmount, string dexType, bool isCreatorVestingEnabled, bool isBeneficiaryVestingEnabled, uint64 creatorVestingDuration, uint64 beneficiaryVestingDuration, uint256 bootstrappingStartTime, uint256 streamStartTime, uint256 streamEndTime, uint256 threshold, string metadataIpfsHash, string tosVersion, bytes32 whitelistRoot, uint16 streamId)"
  ]),
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
  StreamCreated: ethers.id("StreamCreated(address,address,address,uint8,uint8,address,address,address,uint256,uint256,string,bool,bool,uint64,uint64,uint256,uint256,uint256,uint256,string,string,bytes32,uint16)"),
  PoolCreated: ethers.id("PoolCreated(address,address,address,address,uint256,uint256,uint256,uint256,address)"),
  FinalizedStreamed: ethers.id("FinalizedStreamed(address,address,uint256,uint256,uint256)"),
  VestingWalletCreated: ethers.id("VestingWalletCreated(address,address,uint64,uint64,address,uint256)"),
};

export interface StreamCreatedEvent {
  streamFactoryAddress: string;
  streamOutToken: string;
  streamInToken: string;
  inTokenDecimals: number;
  outTokenDecimals: number;
  streamAddress: string;
  creator: string;
  positionStorageAddress: string;
  streamOutAmount: bigint;
  poolOutSupplyAmount: bigint;
  dexType: string;
  isCreatorVestingEnabled: boolean;
  isBeneficiaryVestingEnabled: boolean;
  creatorVestingDuration: bigint;
  beneficiaryVestingDuration: bigint;
  bootstrappingStartTime: bigint;
  streamStartTime: bigint;
  streamEndTime: bigint;
  threshold: bigint;
  metadataIpfsHash: string;
  tosVersion: string;
  whitelistRoot: string;
  streamId: bigint;
}

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
 * Get StreamCreated event from a transaction receipt
 */
export async function getStreamCreatedEvent(
  receipt: ContractTransactionReceipt,
  streamFactoryAddress: string
): Promise<StreamCreatedEvent | null> {
  const logs = await ethers.provider.getLogs({
    address: streamFactoryAddress,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
    topics: [EventTopics.StreamCreated]
  });

  if (logs.length === 0) return null;

  const parsed = EventInterfaces.StreamCreated.parseLog(logs[0]);
  if (!parsed) return null;

  return {
    streamFactoryAddress: parsed.args.streamFactoryAddress,
    streamOutToken: parsed.args.streamOutToken,
    streamInToken: parsed.args.streamInToken,
    inTokenDecimals: parsed.args.inTokenDecimals,
    outTokenDecimals: parsed.args.outTokenDecimals,
    streamAddress: parsed.args.streamAddress,
    creator: parsed.args.creator,
    positionStorageAddress: parsed.args.positionStorageAddress,
    streamOutAmount: parsed.args.streamOutAmount,
    poolOutSupplyAmount: parsed.args.poolOutSupplyAmount,
    dexType: parsed.args.dexType,
    isCreatorVestingEnabled: parsed.args.isCreatorVestingEnabled,
    isBeneficiaryVestingEnabled: parsed.args.isBeneficiaryVestingEnabled,
    creatorVestingDuration: parsed.args.creatorVestingDuration,
    beneficiaryVestingDuration: parsed.args.beneficiaryVestingDuration,
    bootstrappingStartTime: parsed.args.bootstrappingStartTime,
    streamStartTime: parsed.args.streamStartTime,
    streamEndTime: parsed.args.streamEndTime,
    threshold: parsed.args.threshold,
    metadataIpfsHash: parsed.args.metadataIpfsHash,
    tosVersion: parsed.args.tosVersion,
    whitelistRoot: parsed.args.whitelistRoot,
    streamId: parsed.args.streamId,
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

