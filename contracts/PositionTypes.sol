// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

library PositionTypes {
    struct Position {
        uint256 inBalance;
        uint256 shares;
        uint256 index;
        uint256 lastUpdateTime;
        uint256 pendingReward;
        uint256 spentIn;
        uint256 purchased;
        uint256 exitDate;
    }
} 