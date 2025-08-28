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
): FactoryConfig => ({
  ExitFeeRatio: {
    value: 100000, // 10% fee
  },
  feeCollector: deployer,
  minWaitingDuration: 1, // 1 block for hardhat testing
  minBootstrappingDuration: 1, // 1 block for hardhat testing
  minStreamDuration: 1, // 1 block for hardhat testing
  acceptedInTokens,
  streamCreationFee: 0, // No creation fee
  streamCreationFeeToken: "0x0000000000000000000000000000000000000000", // Zero address for native
  protocolAdmin: deployer,
  tosVersion: "1.0.0",
});

export const createProductionFactoryConfig = (
  deployer: string,
  inToken: string,
): FactoryConfig => ({
  ...createFactoryConfig(deployer, [inToken]),
  minWaitingDuration: 3600, // 1 hour
  minBootstrappingDuration: 86400, // 1 day
  minStreamDuration: 259200, // 3 days
  ExitFeeRatio: {
    value: 20000, // 2% fee
  },
});
