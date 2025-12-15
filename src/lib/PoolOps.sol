// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IPoolRouter } from "../interfaces/IPoolRouter.sol";
import { PoolRouterTypes } from "../types/PoolRouterTypes.sol";
import { PoolWrapperTypes } from "../types/PoolWrapperTypes.sol";
import { StreamTypes } from "../types/StreamTypes.sol";

library PoolOps {
    function sortTokensWithAmounts(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) internal pure returns (address token0, address token1, uint256 amount0, uint256 amount1) {
        if (tokenA < tokenB) {
            return (tokenA, tokenB, amountA, amountB);
        }
        return (tokenB, tokenA, amountB, amountA);
    }

    function createPoolViaRouter(
        address router,
        address token0,
        uint256 amount0Desired,
        address token1,
        uint256 amount1Desired,
        StreamTypes.DexType dexType,
        bytes memory extra,
        address creator
    ) internal returns (PoolWrapperTypes.CreatedPoolInfo memory) {
        IPoolRouter poolRouter = IPoolRouter(router);
        PoolRouterTypes.CreatePoolRequest memory req = PoolRouterTypes.CreatePoolRequest({
            tokenA: token0,
            tokenB: token1,
            amountADesired: amount0Desired,
            amountBDesired: amount1Desired,
            dexType: dexType,
            extra: extra,
            creator: creator
        });
        return poolRouter.createPool(req);
    }

    function mapRefundsToInOut(
        PoolWrapperTypes.CreatedPoolInfo memory createdPoolInfo,
        address inToken,
        address outToken
    ) internal pure returns (uint256 refundedOut, uint256 refundedIn) {
        uint256 refunded0 = createdPoolInfo.refundedAmount0;
        uint256 refunded1 = createdPoolInfo.refundedAmount1;

        refundedOut = createdPoolInfo.token0 == outToken ? refunded0 : refunded1;
        refundedIn = createdPoolInfo.token0 == inToken ? refunded0 : refunded1;
    }
}


