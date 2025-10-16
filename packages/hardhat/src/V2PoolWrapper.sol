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
    ) internal virtual override returns (address poolAddress, uint256 amountA, uint256 amountB) {
        IUniswapV2Factory factory = IUniswapV2Factory(V2_FACTORY);
        address existingPool = factory.getPair(createPoolMsg.token0, createPoolMsg.token1);

        if (existingPool == address(0)) {
            poolAddress = factory.createPair(createPoolMsg.token0, createPoolMsg.token1);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        } else {
            poolAddress = existingPool;
        }

        // Approve router to spend tokens
        IERC20(createPoolMsg.token0).approve(V2_ROUTER, createPoolMsg.amount0);
        IERC20(createPoolMsg.token1).approve(V2_ROUTER, createPoolMsg.amount1);

        IUniswapV2Router02 router = IUniswapV2Router02(V2_ROUTER);
        (amountA, amountB, ) = router.addLiquidity(
            createPoolMsg.token0,
            createPoolMsg.token1,
            createPoolMsg.amount0,
            createPoolMsg.amount1,
            0,
            0,
            createPoolMsg.creator,
            block.timestamp + 300
        );
    }

    function _getFactory() internal view virtual override returns (address) {
        return V2_FACTORY;
    }

    function _getRouter() internal view virtual override returns (address) {
        return V2_ROUTER;
    }
}


