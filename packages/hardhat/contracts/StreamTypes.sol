// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./DecimalMath.sol";

interface IStreamTypes {
    enum Status {
        Waiting,
        Bootstrapping,
        Active,
        Ended,
        FinalizedRefunded,
        FinalizedStreamed,
        Cancelled
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
}
