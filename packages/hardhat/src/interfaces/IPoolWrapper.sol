// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapperTypes } from "../types/PoolWrapperTypes.sol";

interface IPoolWrapper {
    function createPool(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) external returns (PoolWrapperTypes.CreatedPoolInfo memory);

    function getPoolInfo(address stream) external view returns (PoolWrapperTypes.CreatedPoolInfo memory);
}
