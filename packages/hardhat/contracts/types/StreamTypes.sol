// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../lib/math/DecimalMath.sol";

library StreamTypes {
    enum Status {
        Waiting,
        Bootstrapping,
        Active,
        Ended,
        FinalizedRefunded,
        FinalizedStreamed,
        Cancelled
    }

    struct createStreamMessage {
        uint256 streamOutAmount;
        address outSupplyToken;
        uint256 bootstrappingStartTime;
        uint256 streamStartTime;
        uint256 streamEndTime;
        uint256 threshold;
        string name;
        address inSupplyToken;
        address creator;
        VestingInfo creatorVesting;
        VestingInfo beneficiaryVesting;
        PoolConfig poolConfig;
        bytes32 salt;
        string tosVersion;
    }
    struct StreamTimes {
        uint256 bootstrappingStartTime;
        uint256 streamStartTime;
        uint256 streamEndTime;
    }

    struct StreamMetadata {
        string name;
    }

    struct StreamState {
        uint256 outRemaining;
        Decimal distIndex;
        uint256 spentIn;
        uint256 shares;
        Decimal currentStreamedPrice;
        uint256 threshold;
        uint256 inSupply;
        uint256 outSupply;
        uint256 lastUpdated;
    }

    struct StreamTokens {
        address inSupplyToken;
        address outSupplyToken;
    }

    struct VestingInfo {
        bool isVestingEnabled;
        uint16 vestingDuration;
        uint16 cliffDuration;
    }

    struct PoolConfig {
        uint256 poolOutSupplyAmount;
    }
}
