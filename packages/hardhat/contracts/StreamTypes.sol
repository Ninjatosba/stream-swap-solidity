// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

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

    struct StatusInfo {
        Status status;
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
        uint256 distIndex;
        uint256 spentIn;
        uint256 shares;
        uint256 currentStreamedPrice;
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
