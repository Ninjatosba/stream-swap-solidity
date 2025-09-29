// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Decimal } from "../lib/math/DecimalMath.sol";

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

    struct CreateStreamMessage {
        address creator;
        address inSupplyToken;
        address outSupplyToken;
        uint256 streamOutAmount;
        uint256 threshold;
        uint256 bootstrappingStartTime;
        uint256 streamStartTime;
        uint256 streamEndTime;
        StreamMetadata metadata;
        VestingInfo creatorVesting;
        VestingInfo beneficiaryVesting;
        PoolInfo poolInfo;
        string tosVersion;
    }
    struct StreamTimes {
        uint256 bootstrappingStartTime;
        uint256 streamStartTime;
        uint256 streamEndTime;
    }

    struct StreamMetadata {
        string ipfsHash;
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
        uint64 vestingDuration;
    }

    struct PoolInfo {
        uint256 poolOutSupplyAmount;
    }

    struct PostStreamActions {
        PoolInfo poolInfo;
        VestingInfo creatorVesting;
        VestingInfo beneficiaryVesting;
    }

    struct TokenCreationInfo {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
    }
}
