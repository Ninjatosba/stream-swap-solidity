// packages/hardhat/deploy/config/factory-config.ts

import { AddressLike, BigNumberish, parseEther } from "ethers";
import { DecimalStruct } from "../../typechain-types/src/StreamCore";

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
        value: 10000, // 1% fee
    },
    feeCollector: deployer,
    minWaitingDuration: 1, // 1 block for hardhat testing
    minBootstrappingDuration: 1, // 1 block for hardhat testing
    minStreamDuration: 1, // 1 block for hardhat testing
    acceptedInTokens,
    streamCreationFee: 1_000_000_000_000_00, // 0.0001 native token
    streamCreationFeeToken: "0x0000000000000000000000000000000000000000", // Zero address for native
    protocolAdmin: deployer,
    tosVersion: "1.0.0",
});

export const createProductionFactoryConfig = (
    deployer: string,
    inTokens: AddressLike[],
): FactoryConfig => (
    {
        ...createFactoryConfig(deployer, inTokens),
        minWaitingDuration: 300, // 5 minutes
        minBootstrappingDuration: 300, // 5 minutes
        minStreamDuration: 300, // 5 minutes
        ExitFeeRatio: {
            value: 45000, // 4.5% fee
        },

        streamCreationFee: parseEther("100"), // 100 native token
    });


