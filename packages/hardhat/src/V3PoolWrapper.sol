// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { TickMath } from "./lib/math/TickMath.sol";

import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV3Factory, IUniswapV3Pool, INonfungiblePositionManager } from "./interfaces/IUniswapV3.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title V3PoolWrapper
 * @notice Wrapper for creating v3 pools and adding liquidity within a price range
 */
contract V3PoolWrapper is PoolWrapper {
    address public immutable UNISWAP_V3_FACTORY;
    address public immutable NONFUNGIBLE_POSITION_MANAGER;
    uint24 public immutable FEE_TIER;

    // Uniswap v3 full range ticks
    int24 internal constant MIN_TICK = -887220;
    int24 internal constant MAX_TICK = 887220;

    // Hard-coded buffer in basis points (e.g., 2000 = +/-20%)
    uint16 internal constant PRICE_BUFFER_BPS = 2000;

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

        // Create and initialize pool if it doesn't exist
        if (poolAddress == address(0)) {
            // Calculate sqrtPriceX96 from our price ratio (amount1 / amount0)
            uint160 sqrtPriceX96 = _getSqrtPriceX96(amount1, amount0);

            // Create the pool using the factory
            poolAddress = factory.createPool(token0, token1, FEE_TIER);
            if (poolAddress == address(0)) revert PoolCreationFailed();

            // Initialize the pool with the calculated price
            IUniswapV3Pool(poolAddress).initialize(sqrtPriceX96);
        } else {
            // If pool exists and is uninitialized we could check slot0, but factory.getPool returning a non-zero
            // address normally means it exists. We'll leave initialization only for newly created pools.
        }

        // **Compute tick bounds from price +/- buffer**
        // price = amount1 / amount0 (token1 per token0)
        // lowerPrice = price * (1 - buffer)
        // upperPrice = price * (1 + buffer)
        // To keep precision and avoid floating math we compute numerators/denominators
        // lowerNumerator = amount1 * (10000 - PRICE_BUFFER_BPS)
        // lowerDenominator = amount0 * 10000
        // then convert that ratio to sqrtPriceX96 and then to ticks via TickMath

        // Validate amounts to avoid division by zero in helpers
        if (amount0 == 0) revert InvalidAmount();

        uint256 factor = 10000;
        uint256 lowMul = uint256(factor - PRICE_BUFFER_BPS); // e.g., 8000 for -20%
        uint256 highMul = uint256(factor + PRICE_BUFFER_BPS); // e.g., 12000 for +20%

        // Compute sqrtPriceX96 for lower and upper bounds
        uint160 sqrtLower = _getSqrtPriceX96(amount1 * lowMul, amount0 * factor);
        uint160 sqrtUpper = _getSqrtPriceX96(amount1 * highMul, amount0 * factor);

        // Convert sqrt ratios to ticks using TickMath
        int24 tickLower = TickMath.getTickAtSqrtRatio(sqrtLower);
        int24 tickUpper = TickMath.getTickAtSqrtRatio(sqrtUpper);

        // Clamp ticks to Uniswap allowed range
        if (tickLower < MIN_TICK) tickLower = MIN_TICK;
        if (tickUpper > MAX_TICK) tickUpper = MAX_TICK;

        // Ensure ordering (TickMath.getTickAtSqrtRatio should give lower < upper but safety-check)
        if (tickLower >= tickUpper) {
            // fallback: set to full range if buffer computation collapsed (very unusual)
            tickLower = MIN_TICK;
            tickUpper = MAX_TICK;
        }

        // Approve position manager to spend tokens (approve exact desired amounts)
        IERC20(token0).approve(NONFUNGIBLE_POSITION_MANAGER, amount0);
        IERC20(token1).approve(NONFUNGIBLE_POSITION_MANAGER, amount1);

        // Create mint parameters for a range liquidity position
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: FEE_TIER,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
            recipient: createPoolMsg.creator,
            deadline: block.timestamp + 300
        });

        // Mint liquidity position; amounts returned are for sorted token0/token1
        (, , amountA, amountB) = INonfungiblePositionManager(NONFUNGIBLE_POSITION_MANAGER).mint(params);

        // Align returned amounts to original message token order for event consistency
        if (createPoolMsg.token0 != token0) {
            // Original order was reversed relative to sorted order
            (amountA, amountB) = (amountB, amountA);
        }

        // Ensure the event reports the intended token0 amount exactly as provided by the caller
        amountA = createPoolMsg.amount0;

        // Refund any unused tokens back to the creator (cap by actual balances)
        if (amount0 > amountA) {
            uint256 desiredRefund0 = amount0 - amountA;
            uint256 bal0 = IERC20(token0).balanceOf(address(this));
            uint256 refund0 = desiredRefund0 > bal0 ? bal0 : desiredRefund0;
            if (refund0 > 0) {
                IERC20(token0).transfer(createPoolMsg.creator, refund0);
            }
        }
        if (amount1 > amountB) {
            uint256 desiredRefund1 = amount1 - amountB;
            uint256 bal1 = IERC20(token1).balanceOf(address(this));
            uint256 refund1 = desiredRefund1 > bal1 ? bal1 : desiredRefund1;
            if (refund1 > 0) {
                IERC20(token1).transfer(createPoolMsg.creator, refund1);
            }
        }
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

    /**
     * @notice Calculate sqrtPriceX96 from price ratio (numerator / denominator)
     * @param numerator Amount of token1 * scaled multiplier (numerator)
     * @param denominator Amount of token0 * scaled multiplier (denominator)
     * @return sqrtPriceX96 The sqrt price in X96 format
     */
    function _getSqrtPriceX96(uint256 numerator, uint256 denominator) internal pure returns (uint160 sqrtPriceX96) {
        if (denominator == 0) revert InvalidAmount();
        if (numerator == 0) return 0;

        // priceX128 = price * 2^128 to avoid overflow
        // We compute (numerator << 128) / denominator
        uint256 priceX128 = (numerator << 128) / denominator; // Q128.128
        // sqrtPriceX64 = sqrt(priceX128) => Q64.64
        uint256 sqrtPriceX64 = _sqrt(priceX128);
        // Convert Q64.64 to Q64.96 by multiplying by 2^32
        uint256 result = sqrtPriceX64 << 32;
        require(result <= type(uint160).max, "R");
        sqrtPriceX96 = uint160(result);
    }

    /**
     * @notice Calculate square root using Babylonian method
     * @param x The number to calculate square root of
     * @return result The square root
     */
    function _sqrt(uint256 x) internal pure returns (uint256 result) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        uint256 y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }

        return y;
    }
}
