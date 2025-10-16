// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PoolWrapperTypes {
    struct CreatePoolMsg {
        address token0;
        address token1;
        uint256 amount0;
        uint256 amount1;
        address creator;
    }

    struct CreatedPoolInfo {
        address poolAddress;
        address token0;
        address token1;
    }
}
