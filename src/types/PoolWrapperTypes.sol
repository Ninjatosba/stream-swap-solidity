// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PoolWrapperTypes {
    struct CreatePoolMsg {
        address token0;
        address token1;
        uint256 amount0Desired;
        uint256 amount1Desired;
        address creator;
        bytes extra; // abi-encoded per-dex parameters (optional)
    }

    struct CreatedPoolInfo {
        address poolAddress;
        address token0;
        address token1;
        uint256 amount0;
        uint256 amount1;
        address creator;
        uint256 refundedAmount0;
        uint256 refundedAmount1;
    }
}
