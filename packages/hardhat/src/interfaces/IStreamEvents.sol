// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStreamEvents {
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

    event StreamCancelled(address indexed streamAddress, address creator, uint256 outSupply, uint8 status);

    event StreamMetadataUpdated(address indexed streamAddress, string metadataIpfsHash);
}
