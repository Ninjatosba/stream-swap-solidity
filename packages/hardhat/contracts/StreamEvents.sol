// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./StreamTypes.sol";
import "./DecimalMath.sol";

interface IStreamEvents {
    event StreamCreated(
        address indexed streamOutToken,
        address indexed streamInToken,
        address indexed streamFactoryAddress,
        uint256 streamOutAmount,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime,
        uint256 threshold,
        string streamName,
        string tosVersion,
        address streamAddress,
        uint16 streamId
    );

    event StreamSynced(address indexed streamAddress, IStreamTypes.Status mainStatus, uint256 lastUpdated);

    event Subscribed(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 amountIn,
        uint256 newShares,
        uint256 totalSharesAfter,
        uint256 totalInSupplyAfter
    );

    event StreamSynced(
        address indexed streamAddress,
        uint256 lastUpdated,
        uint8 newStatus,
        Decimal distIndex,
        uint256 outRemaining,
        uint256 inSupply,
        uint256 spentIn,
        Decimal currentStreamedPrice
    );

    event PositionSynced(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 inBalance,
        uint256 shares
    );

    event Withdrawn(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 remainingInBalance,
        uint256 remainingShares,
        uint256 totalInSupply,
        uint256 totalShares
    );

    event Exited(
        address indexed streamAddress,
        address indexed subscriber,
        uint256 purchased,
        uint256 spentIn,
        uint256 exitTimestamp
    );

    event StreamFinalized(
        address indexed streamAddress,
        address indexed creator,
        uint256 creatorRevenue,
        uint256 exitFeeAmount,
        IStreamTypes.Status status
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

    event StreamCancelled(
        address indexed streamAddress,
        address creator,
        uint256 outSupply,
        IStreamTypes.Status status
    );

    event VestingContractDeployed(address indexed factoryAddress, address vestingContract);
}
