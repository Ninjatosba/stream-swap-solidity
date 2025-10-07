// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV3Factory, INonfungiblePositionManager } from "./interfaces/IUniswapV3.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title UniswapV3PoolWrapper
 * @notice Wrapper for creating v3 pools and adding full-range liquidity
 */
contract UniswapV3PoolWrapper is PoolWrapper {
    address public immutable UNISWAP_V3_FACTORY;
    address public immutable NONFUNGIBLE_POSITION_MANAGER;
    uint24 public immutable FEE_TIER;

    // Uniswap v3 full range ticks
    int24 internal constant MIN_TICK = -887220;
    int24 internal constant MAX_TICK = 887220;

    constructor(address factory, address positionManager, uint24 feeTier) {
        if (factory == address(0)) revert InvalidAddress();
        if (positionManager == address(0)) revert InvalidAddress();
        if (feeTier == 0) revert InvalidAmount();

        UNISWAP_V3_FACTORY = factory;
        NONFUNGIBLE_POSITION_MANAGER = positionManager;
        FEE_TIER = feeTier;
    }

    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual override returns (address poolAddress, uint256 amountA, uint256 amountB) {
        // Sort tokens for v3 requirements
        (address token0, address token1, uint256 amount0, uint256 amount1) = _sortTokens(
            createPoolMsg.token0,
            createPoolMsg.token1,
            createPoolMsg.amount0,
            createPoolMsg.amount1
        );

        IUniswapV3Factory factory = IUniswapV3Factory(UNISWAP_V3_FACTORY);
        poolAddress = factory.getPool(token0, token1, FEE_TIER);

        // Initialize pool with 1:1 price if not exists
        if (poolAddress == address(0)) {
            // 1.0 price => sqrtPriceX96 = 2^96
            uint160 sqrtPriceX96 = 79228162514264337593543950336; // 2**96
            poolAddress = INonfungiblePositionManager(NONFUNGIBLE_POSITION_MANAGER)
                .createAndInitializePoolIfNecessary(token0, token1, FEE_TIER, sqrtPriceX96);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        }

        // Approve position manager
        IERC20(token0).approve(NONFUNGIBLE_POSITION_MANAGER, amount0);
        IERC20(token1).approve(NONFUNGIBLE_POSITION_MANAGER, amount1);

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: FEE_TIER,
            tickLower: MIN_TICK,
            tickUpper: MAX_TICK,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
            recipient: address(this),
            deadline: block.timestamp + 300
        });

        // Mint full-range liquidity; amounts returned are actual used
        (, , amountA, amountB) = INonfungiblePositionManager(NONFUNGIBLE_POSITION_MANAGER).mint(params);
    }

    function _getFactory() internal view virtual override returns (address) {
        return UNISWAP_V3_FACTORY;
    }

    function _getRouter() internal view virtual override returns (address) {
        return NONFUNGIBLE_POSITION_MANAGER;
    }

    function _sortTokens(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) internal pure returns (address token0, address token1, uint256 amount0, uint256 amount1) {
        if (tokenA < tokenB) {
            return (tokenA, tokenB, amountA, amountB);
        } else {
            return (tokenB, tokenA, amountB, amountA);
        }
    }
}


