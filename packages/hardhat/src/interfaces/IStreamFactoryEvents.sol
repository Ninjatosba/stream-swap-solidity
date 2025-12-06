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
        bool isCreatorVestingEnabled,
        bool isBeneficiaryVestingEnabled,
        uint64 creatorVestingDuration,
        uint64 beneficiaryVestingDuration,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime,
        uint256 threshold,
        string metadataIpfsHash,
        string tosVersion,
        bytes32 whitelistRoot,
        uint16 streamId
    );

    event TokenCreated(address indexed token, string name, string symbol, uint8 decimals, uint256 totalSupply);

    event FactoryInitialized(
        address indexed factory,
        address basicImplementationAddress,
        address postActionsImplementationAddress,
        address poolRouterAddress,
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

    event FeeCollectorUpdated(address indexed factory, address oldFeeCollector, address newFeeCollector);

    event ProtocolAdminUpdated(address indexed factory, address oldProtocolAdmin, address newProtocolAdmin);

    event StreamFeeParametersUpdated(
        address indexed factory,
        uint256 oldFee,
        uint256 newFee,
        address oldFeeToken,
        address newFeeToken
    );

    event TimingParametersUpdated(
        address indexed factory,
        uint256 oldMinWaitingDuration,
        uint256 newMinWaitingDuration,
        uint256 oldMinBootstrappingDuration,
        uint256 newMinBootstrappingDuration,
        uint256 oldMinStreamDuration,
        uint256 newMinStreamDuration
    );

    event ImplementationParametersUpdated(
        address indexed factory,
        address oldBasic,
        address newBasic,
        address oldPostActions,
        address newPostActions
    );

    event PoolRouterUpdated(
        address indexed factory,
        address oldPoolRouter,
        address newPoolRouter
    );

    event ExitFeeRatioUpdated(address indexed factory, uint256 oldRatio, uint256 newRatio);

    event TosVersionUpdated(address indexed factory, string oldVersion, string newVersion);

    event FrozenStateUpdated(address indexed factory, bool frozen);

    event AcceptedTokensUpdated(address indexed factory, address[] tokensAdded, address[] tokensRemoved);
    
    event VestingFactoryUpdated(address indexed factory, address oldVestingFactory, address newVestingFactory);
}
