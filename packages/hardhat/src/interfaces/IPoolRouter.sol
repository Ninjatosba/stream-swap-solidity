// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StreamTypes } from "../types/StreamTypes.sol";
import { PoolWrapperTypes } from "../types/PoolWrapperTypes.sol";
import { PoolRouterTypes } from "../types/PoolRouterTypes.sol";

interface IPoolRouter {
    // Admin
    function setWrapper(StreamTypes.DexType dex, uint256 key, address wrapper) external;
    function getWrapper(StreamTypes.DexType dex, uint256 key) external view returns (address);

    // Factory-time validation
    function validatePoolParams(StreamTypes.PoolInfo calldata info) external view;

    // Stream-time execution
    function createPool(PoolRouterTypes.CreatePoolRequest calldata req)
        external
        returns (PoolWrapperTypes.CreatedPoolInfo memory);
}


