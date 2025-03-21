// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./StreamTypes.sol";

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
        string streamId
    );

    event StreamSynced(IStreamTypes.Status mainStatus, uint256 lastUpdated);

    event Subscribed(address indexed subscriber, uint256 amountIn, uint256 newShares);
    event Withdrawn(address indexed subscriber, uint256 amountIn);
    event Exited(address indexed subscriber, uint256 purchased);
    event StreamFinalized(address indexed creator, uint256 spentIn, uint256 outRemaining, IStreamTypes.Status status);
    event ParamsUpdated();
    event FeeCollectorUpdated(address newFeeCollector);
    event ProtocolAdminUpdated(address newProtocolAdmin);
    event FrozenStateUpdated(bool frozen);
}
