// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;



interface IStreamEvents {
    event StreamCreated(
        address indexed streamFactoryAddress,
        address streamOutToken,
        address streamInToken,
        address streamAddress,
        address positionStorageAddress,
        uint256 streamOutAmount,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime,
        uint256 threshold,
        string metadataIpfsHash,
        string tosVersion,
        uint16 streamId
    );

    event StreamStateUpdated(
        address indexed streamAddress,
        uint256 lastUpdated,
        uint256 distIndex,
        uint256 outRemaining,
        uint256 inSupply,
        uint256 spentIn,
        uint256 currentStreamedPrice
    );

    event Subscribed(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 positionInBalance,
        uint256 positionShares,
        uint256 positionLastUpdateTime,
        uint256 positionSpentIn,
        uint256 positionPurchased,
        uint256 positionIndex,
        uint256 streamInSupply,
        uint256 streamShares
    );

    event StreamSynced(
        address indexed streamAddress,
        uint256 lastUpdated,
        uint8 newStatus,
        uint256 distIndex,
        uint256 outRemaining,
        uint256 inSupply,
        uint256 spentIn,
        uint256 currentStreamedPrice
    );

    event PositionSynced(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 positionInBalance,
        uint256 positionShares,
        uint256 positionLastUpdateTime,
        uint256 positionSpentIn,
        uint256 positionPurchased,
        uint256 positionIndex
    );

    event Withdrawn(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 positionInBalance,
        uint256 positionShares,
        uint256 positionLastUpdateTime,
        uint256 positionSpentIn,
        uint256 positionPurchased,
        uint256 positionIndex,
        uint256 streamInSupply,
        uint256 streamShares
    );

    event ExitRefunded(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 inBalance,
        uint256 spentIn,
        uint256 exitTimestamp
    );
    event ExitStreamed(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 purchased,
        uint256 spentIn,
        uint256 index,
        uint256 inBalance,
        uint256 exitTimestamp
    );

    event FinalizedStreamed(
        address indexed streamAddress,
        address indexed creator,
        uint256 creatorRevenue,
        uint256 exitFeeAmount,
        uint256 refundedOutAmount
    );

    event FinalizedRefunded(address indexed streamAddress, address indexed creator, uint256 refundedOutAmount);

    event FactoryInitialized(
        address indexed factory,
        address streamImplementationAddress,
        address poolWrapperAddress,
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

    event StreamCancelled(address indexed streamAddress, address creator, uint256 outSupply, uint8 status);

    event VestingContractDeployed(address indexed factoryAddress, address vestingContract);

    event PoolWrapperUpdated(address indexed factoryAddress, address poolWrapper);

    event StreamMetadataUpdated(address indexed streamAddress, string metadataIpfsHash);
}
