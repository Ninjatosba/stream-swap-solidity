// packages/hardhat/deploy/config/factory-config.ts

import { AddressLike } from "ethers";
import { DecimalStruct } from "../../typechain-types/contracts/StreamFactory";
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
    uniswapV2FactoryAddress?: string;
    uniswapV2RouterAddress?: string;
    streamFactoryAdmin: string;
    streamFactoryTreasury: string;
    streamFactoryOperator: string;
    streamFactoryPauser: string;
    streamFactoryUpgrader: string;
}

export const createFactoryConfig = (deployer: string, acceptedInTokens: AddressLike[]): FactoryConfig => ({
    ExitFeeRatio: {
        value: 100000, // 10% fee
    },
    feeCollector: deployer,
    minWaitingDuration: 5,
    minBootstrappingDuration: 1,
    minStreamDuration: 1,
    acceptedInTokens,
    streamCreationFee: 0,
    streamCreationFeeToken: "0x0000000000000000000000000000000000000000",
    protocolAdmin: deployer,
    tosVersion: "1.0.0",
    uniswapV2FactoryAddress: "0x0000000000000000000000000000000000000000",
    uniswapV2RouterAddress: "0x0000000000000000000000000000000000000000",
    streamFactoryAdmin: deployer,
    streamFactoryTreasury: deployer,
    streamFactoryOperator: deployer,
    streamFactoryPauser: deployer,
    streamFactoryUpgrader: deployer,
});

export const createTestnetFactoryConfig = (deployer: string, inToken: string): FactoryConfig => ({
    ...createFactoryConfig(deployer, [inToken]),
    minWaitingDuration: 1, // 5 minutes
    minBootstrappingDuration: 1, // 10 minutes
    minStreamDuration: 1, // 30 minutes
});

export const createProductionFactoryConfig = (deployer: string, inToken: string): FactoryConfig => ({
    ...createFactoryConfig(deployer, [inToken]),
    minWaitingDuration: 3600, // 1 hour
    minBootstrappingDuration: 86400, // 1 day
    minStreamDuration: 259200, // 3 days
    ExitFeeRatio: {
        value: 20000, // 2% fee
    },
});