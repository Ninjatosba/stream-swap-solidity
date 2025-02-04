// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IStreamEvents {
    event StreamCreated(
        uint256 indexed streamOutAmount,
        uint256 indexed bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime
    );
    
    event StreamSynced(
        Status mainStatus,
        FinalizedStatus finalized,
        uint256 lastUpdated
    );
    
    event Subscribed(address indexed subscriber, uint256 amountIn, uint256 newShares);
    event Withdrawn(address indexed subscriber, uint256 amountIn);
    event Exited(address indexed subscriber, uint256 purchased);
    event StreamFinalized(address indexed creator, uint256 spentIn, uint256 outRemaining);
} 