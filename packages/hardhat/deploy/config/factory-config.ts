// packages/hardhat/deploy/config/factory-config.ts

import { AddressLike } from "ethers";
import { DecimalStruct } from "../../typechain-types/src/Stream";
import { BigNumberish } from "ethers";

export interface FactoryConfig {
  ExitFeeRatio: DecimalStruct;
  feeCollector: string;
  protocolAdmin: string;
  minWaitingDuration: number;
  minBootstrappingDuration: number;
  minStreamDuration: number;
  acceptedInTokens: AddressLike[];
  streamCreationFee: BigNumberish;
  streamCreationFeeToken: AddressLike;
  tosVersion: string;
}

export const createFactoryConfig = (
  deployer: string,
  acceptedInTokens: AddressLike[],
  streamCreationFee: BigNumberish,
  streamCreationFeeToken: AddressLike,
): FactoryConfig => ({
  ExitFeeRatio: {
    value: 100000, // 10% fee
  },
  feeCollector: deployer,
  minWaitingDuration: 5,
  minBootstrappingDuration: 1,
  minStreamDuration: 1,
  acceptedInTokens,
  streamCreationFee,
  streamCreationFeeToken,
  protocolAdmin: deployer,
  tosVersion: "1.0.0",
});

export const createTestnetFactoryConfig = (
  deployer: string,
  inToken: string,
  streamCreationFee: BigNumberish,
  streamCreationFeeToken: AddressLike,
): FactoryConfig => ({
  ...createFactoryConfig(deployer, [inToken], streamCreationFee, streamCreationFeeToken),
  minWaitingDuration: 1, // 5 minutes
  minBootstrappingDuration: 1, // 10 minutes
  minStreamDuration: 1, // 30 minutes
});

export const createProductionFactoryConfig = (
  deployer: string,
  inToken: string,
  streamCreationFee: BigNumberish,
  streamCreationFeeToken: AddressLike,
): FactoryConfig => ({
  ...createFactoryConfig(deployer, [inToken], streamCreationFee, streamCreationFeeToken),
  minWaitingDuration: 3600, // 1 hour
  minBootstrappingDuration: 86400, // 1 day
  minStreamDuration: 259200, // 3 days
  ExitFeeRatio: {
    value: 20000, // 2% fee
  },
});
