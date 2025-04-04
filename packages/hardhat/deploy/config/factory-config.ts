// packages/hardhat/deploy/config/factory-config.ts

import { AddressLike } from "ethers";
import { DecimalStruct } from "../../typechain-types/contracts/StreamFactory";

export interface FactoryConfig {
    ExitFeeRatio: DecimalStruct;
    feeCollector: string;
    protocolAdmin: string;
    minWaitingDuration: number;
    minBootstrappingDuration: number;
    minStreamDuration: number;
    acceptedInDenoms: AddressLike[];
    streamCreationFee: number;
    streamCreationFeeToken: AddressLike;
    tosVersion: string;
}

export const createFactoryConfig = (deployer: string, acceptedInDenoms: AddressLike[]): FactoryConfig => ({
    ExitFeeRatio: {
        value: 100000, // 10% fee
    },
    feeCollector: deployer,
    minWaitingDuration: 5,
    minBootstrappingDuration: 1,
    minStreamDuration: 1,
    acceptedInDenoms: acceptedInDenoms,
    streamCreationFee: 0,
    streamCreationFeeToken: "0x0000000000000000000000000000000000000000",
    protocolAdmin: deployer,
    tosVersion: "1.0.0",
});

export const createTestnetFactoryConfig = (deployer: string, inDenom: string): FactoryConfig => ({
    ...createFactoryConfig(deployer, [inDenom]),
    minWaitingDuration: 1, // 5 minutes
    minBootstrappingDuration: 1, // 10 minutes
    minStreamDuration: 1, // 30 minutes
});

export const createProductionFactoryConfig = (deployer: string, inDenom: string): FactoryConfig => ({
    ...createFactoryConfig(deployer, [inDenom]),
    minWaitingDuration: 3600, // 1 hour
    minBootstrappingDuration: 86400, // 1 day
    minStreamDuration: 259200, // 3 days
    ExitFeeRatio: {
        value: 20000, // 2% fee
    },
});