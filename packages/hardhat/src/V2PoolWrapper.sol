// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV2Factory, IUniswapV2Router02 } from "./interfaces/IUniswapV2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title V2PoolWrapper
 * @notice Generic wrapper for V2-like AMMs (UniswapV2-compatible and PancakeSwap)
 */
contract V2PoolWrapper is PoolWrapper {
    address public immutable V2_FACTORY;
    address public immutable V2_ROUTER;

    constructor(address factory, address router) {
        if (factory == address(0)) revert InvalidAddress();
        if (router == address(0)) revert InvalidAddress();

        V2_FACTORY = factory;
        V2_ROUTER = router;
    }

    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual override returns (address poolAddress, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1) {
        IUniswapV2Factory factory = IUniswapV2Factory(V2_FACTORY);
        address existingPool = factory.getPair(createPoolMsg.token0, createPoolMsg.token1);

        if (existingPool == address(0)) {
            poolAddress = factory.createPair(createPoolMsg.token0, createPoolMsg.token1);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        } else {
            poolAddress = existingPool;
        }

        // Approve router to spend tokens
        IERC20(createPoolMsg.token0).approve(V2_ROUTER, createPoolMsg.amount0Desired);
        IERC20(createPoolMsg.token1).approve(V2_ROUTER, createPoolMsg.amount1Desired);

        IUniswapV2Router02 router = IUniswapV2Router02(V2_ROUTER);
        (amount0, amount1, ) = router.addLiquidity(
            createPoolMsg.token0,
            createPoolMsg.token1,
            createPoolMsg.amount0Desired,
            createPoolMsg.amount1Desired,
            0,
            0,
            createPoolMsg.creator,
            block.timestamp + 300
        );

        // Calculate refunds
        refundedAmount0 = createPoolMsg.amount0Desired - amount0;
        refundedAmount1 = createPoolMsg.amount1Desired - amount1;
    }

    function _getFactory() internal view virtual override returns (address) {
        return V2_FACTORY;
    }

    function _getRouter() internal view virtual override returns (address) {
        return V2_ROUTER;
    }
}


