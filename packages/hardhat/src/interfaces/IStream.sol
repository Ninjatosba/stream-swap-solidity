// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StreamTypes } from "../types/StreamTypes.sol";
import { PositionTypes } from "../types/PositionTypes.sol";

interface IStream {
    function initialize(
        StreamTypes.CreateStreamMessage memory createStreamMessage,
        address positionStorageAddress
    ) external;

    function withdraw(uint256 cap) external;

    function subscribe(uint256 amountIn) external;

    function exitStream() external;

    function finalizeStream() external;

    function syncStreamExternal() external;

    function syncPositionExternal(address user) external;

    function cancelStream() external;

    function cancelWithAdmin() external;

    // View functions
    function getStreamStatus() external view returns (StreamTypes.Status);

    function getStreamState() external view returns (StreamTypes.StreamState memory);

    function getPosition(address user) external view returns (PositionTypes.Position memory);

    // State variables getters (since they're public)
    function creator() external view returns (address);

    function positionStorageAddress() external view returns (address);

    function streamFactoryAddress() external view returns (address);
}
