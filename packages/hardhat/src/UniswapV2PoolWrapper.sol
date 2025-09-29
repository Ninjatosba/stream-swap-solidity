// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV2Factory, IUniswapV2Router02 } from "./interfaces/IUniswapV2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapV2PoolWrapper is PoolWrapper {
    // Uniswap V2 addresses
    address public immutable UNISWAP_V2_FACTORY;
    address public immutable UNISWAP_V2_ROUTER;

    constructor(address _uniswapV2Factory, address _uniswapV2Router) {
        if (_uniswapV2Factory == address(0)) revert InvalidAddress();
        if (_uniswapV2Router == address(0)) revert InvalidAddress();
        
        UNISWAP_V2_FACTORY = _uniswapV2Factory;
        UNISWAP_V2_ROUTER = _uniswapV2Router;
    }

    /**
     * @dev Implements UniswapV2-specific pool creation and liquidity addition
     */
    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual override returns (address poolAddress, uint256 amountA, uint256 amountB) {
        // Check if pool already exists
        IUniswapV2Factory factory = IUniswapV2Factory(UNISWAP_V2_FACTORY);
        address existingPool = factory.getPair(createPoolMsg.token0, createPoolMsg.token1);
        
        if (existingPool == address(0)) {
            // Create the pool
            poolAddress = factory.createPair(createPoolMsg.token0, createPoolMsg.token1);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        } else {
            poolAddress = existingPool;
        }

        // Add liquidity to the pool
        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAP_V2_ROUTER);
        
        // Approve router to spend tokens
        IERC20(createPoolMsg.token0).approve(UNISWAP_V2_ROUTER, createPoolMsg.amount0);
        IERC20(createPoolMsg.token1).approve(UNISWAP_V2_ROUTER, createPoolMsg.amount1);
        
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
     * @dev Returns the UniswapV2 factory address
     */
    function _getFactory() internal view virtual override returns (address) {
        return UNISWAP_V2_FACTORY;
    }

    /**
     * @dev Returns the UniswapV2 router address
     */
    function _getRouter() internal view virtual override returns (address) {
        return UNISWAP_V2_ROUTER;
    }
} 