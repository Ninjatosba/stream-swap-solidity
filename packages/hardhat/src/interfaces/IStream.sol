// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StreamTypes } from "../types/StreamTypes.sol";
import { PositionTypes } from "../types/PositionTypes.sol";
import { StreamFactoryTypes } from "../types/StreamFactoryTypes.sol";
import { IStreamEvents } from "./IStreamEvents.sol";
import { IStreamErrors } from "./IStreamErrors.sol";
import { IPermit2 } from "./IPermit2.sol";

interface IStream is IStreamEvents, IStreamErrors {
    function initialize(
        StreamTypes.CreateStreamMessage memory createStreamMessage,
        address positionStorageAddress
    ) external;

    function withdraw(uint256 cap) external;

    function subscribe(uint256 amountIn, bytes32[] calldata merkleProof) external;

    function subscribeWithNativeToken(uint256 amountIn, bytes32[] calldata merkleProof) external payable;

    function subscribeWithPermit(
        uint256 amountIn,
        address owner,
        IPermit2.PermitSingle calldata permitSingle,
        bytes calldata signature,
        bytes32[] calldata merkleProof
    ) external;

    function exitStream() external;

    function finalizeStream() external;

    function syncStreamExternal() external;

    function syncPositionExternal(address user) external;

    function cancelStream() external;

    function cancelWithAdmin() external;

    // View functions
    function getStreamStatus() external view returns (StreamTypes.Status);

    function getStreamState() external view returns (StreamTypes.StreamState memory);

    function getStreamMetadata() external view returns (StreamTypes.StreamMetadata memory);

    function getPostStreamActions() external view returns (StreamTypes.PostStreamActions memory);

    function getPosition(address user) external view returns (PositionTypes.Position memory);

    // State variables getters (since they're public)
    function creator() external view returns (address);

    function positionStorageAddress() external view returns (address);

    function streamFactoryAddress() external view returns (address);

    function updateStreamMetadata(string memory metadataIpfsHash) external;

    /// @notice Returns the optional whitelist root for this stream; zero means no whitelist
    function whitelistRoot() external view returns (bytes32);
}
