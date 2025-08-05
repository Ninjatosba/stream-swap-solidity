// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV2Factory } from "./interfaces/IUniswapV2.sol";
import { IPancakeRouter } from "./interfaces/IPancakeRouter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PancakePoolWrapper is PoolWrapper {
    // Pancake addresses
    address public immutable PANCAKE_FACTORY;
    address public immutable PANCAKE_ROUTER;

    constructor(address _pancakeFactory, address _pancakeRouter) {
        if (_pancakeFactory == address(0)) revert InvalidAddress();
        if (_pancakeRouter == address(0)) revert InvalidAddress();
        
        PANCAKE_FACTORY = _pancakeFactory;
        PANCAKE_ROUTER = _pancakeRouter;
    }

    /**
     * @dev Implements Pancake-specific pool creation and liquidity addition
     */
    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual override returns (address poolAddress, uint256 amountA, uint256 amountB) {
        // Check if pool already exists
        IUniswapV2Factory factory = IUniswapV2Factory(PANCAKE_FACTORY);
        address existingPool = factory.getPair(createPoolMsg.token0, createPoolMsg.token1);
        
        if (existingPool == address(0)) {
            // Create the pool
            poolAddress = factory.createPair(createPoolMsg.token0, createPoolMsg.token1);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        } else {
            poolAddress = existingPool;
        }

        // Add liquidity to the pool
        IPancakeRouter router = IPancakeRouter(PANCAKE_ROUTER);
        
        // Approve router to spend tokens
        IERC20(createPoolMsg.token0).approve(PANCAKE_ROUTER, createPoolMsg.amount0);
        IERC20(createPoolMsg.token1).approve(PANCAKE_ROUTER, createPoolMsg.amount1);
        
        // Add liquidity (returns actual amounts added and LP tokens received)
        (amountA, amountB, ) = router.addLiquidity(
            createPoolMsg.token0,
            createPoolMsg.token1,
            createPoolMsg.amount0,
            createPoolMsg.amount1,
            0, // amountAMin - accept any amount
            0, // amountBMin - accept any amount
            address(0), // LP tokens are burned
            block.timestamp + 300 // 5 minute deadline
        );
    }

    /**
     * @dev Returns the Pancake factory address
     */
    function _getFactory() internal view virtual override returns (address) {
        return PANCAKE_FACTORY;
    }

    /**
     * @dev Returns the Pancake router address
     */
    function _getRouter() internal view virtual override returns (address) {
        return PANCAKE_ROUTER;
    }
} 