// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStreamFactoryEvents {
    event StreamCreated(
        address indexed streamFactoryAddress,
        address streamOutToken,
        address streamInToken,
        address streamAddress,
        address creator,
        address positionStorageAddress,
        uint256 streamOutAmount,
        uint256 poolOutSupplyAmount,
        string dexType,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime,
        uint256 threshold,
        string metadataIpfsHash,
        string tosVersion,
        uint16 streamId
    );

    event TokenCreated(address indexed token, string name, string symbol, uint8 decimals, uint256 totalSupply);

    event FactoryInitialized(
        address indexed factory,
        address streamImplementationAddress,
        address V2PoolWrapperAddress,
        address V3PoolWrapperAddress,
        address feeCollector,
        address protocolAdmin,
        address streamCreationFeeToken,
        address[] acceptedInSupplyTokens,
        uint256 streamCreationFee,
        uint256 exitFeeRatio,
        uint256 minWaitingDuration,
        uint256 minBootstrappingDuration,
        uint256 minStreamDuration,
        string tosVersion,
        address vestingAddress
    );

    event ParamsUpdated(
        address indexed factory,
        uint256 streamCreationFee,
        uint256 exitFeeRatio,
        uint256 minWaitingDuration,
        uint256 minBootstrappingDuration,
        uint256 minStreamDuration,
        string tosVersion
    );

    event FeeCollectorUpdated(address indexed factory, address newFeeCollector);

    event ProtocolAdminUpdated(address indexed factory, address newProtocolAdmin);

    event FrozenStateUpdated(address indexed factory, bool frozen);

    event AcceptedTokensUpdated(address indexed factory, address[] tokensAdded, address[] tokensRemoved);

    event VestingContractDeployed(address indexed factoryAddress, address vestingContract);

    event PoolWrapperUpdated(address indexed factoryAddress, address V2PoolWrapperAddress, address V3PoolWrapperAddress);
}
