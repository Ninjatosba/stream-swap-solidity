// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./StreamTypes.sol";

interface IStreamEvents {
        event StreamCreated(
        uint256 indexed streamOutAmount,
        uint256 indexed bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime,
        address indexed streamAddress
    );
    
    event StreamSynced(
        IStreamTypes.Status mainStatus,
        IStreamTypes.Substatus subStatus,
        uint256 lastUpdated
    );
    
    event Subscribed(address indexed subscriber, uint256 amountIn, uint256 newShares);
    event Withdrawn(address indexed subscriber, uint256 amountIn);
    event Exited(address indexed subscriber, uint256 purchased);
    event StreamFinalized(address indexed creator, uint256 spentIn, uint256 outRemaining, IStreamTypes.Substatus subStatus);
    event ParamsUpdated();
    event FeeCollectorUpdated(address newFeeCollector);
    event ProtocolAdminUpdated(address newProtocolAdmin);
    event FrozenStateUpdated(bool frozen);
}