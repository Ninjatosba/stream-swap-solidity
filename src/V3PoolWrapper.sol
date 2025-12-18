// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { TickMath } from "./lib/math/TickMath.sol";

import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV3Factory, IUniswapV3Pool, INonfungiblePositionManager } from "./interfaces/IUniswapV3.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

/**
 * @title V3PoolWrapper
 * @notice Wrapper for creating v3 pools and adding liquidity within a price range
 */
contract V3PoolWrapper is PoolWrapper {
    address public immutable UNISWAP_V3_FACTORY;
    address public immutable NONFUNGIBLE_POSITION_MANAGER;
    uint24 public immutable FEE_TIER;

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
    ) internal virtual override returns (address poolAddress, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1) {

        // TODO: add extra check for token0 and token1
        // TODO: add extra check for fee tier and possibly if invalid fee is provided should fallback to default fee tier
        address token0 = createPoolMsg.token0;
        address token1 = createPoolMsg.token1;
        uint256 amount0Desired = createPoolMsg.amount0Desired;
        uint256 amount1Desired = createPoolMsg.amount1Desired;

        // Determine fee tier: prefer msg.extra if provided, otherwise fallback to immutable
        uint24 feeTier = FEE_TIER;
        if (createPoolMsg.extra.length > 0) {
            uint24 decodedFee = abi.decode(createPoolMsg.extra, (uint24));
            if (decodedFee == 0) revert InvalidAmount();
            feeTier = decodedFee;
        }

        IUniswapV3Factory factory = IUniswapV3Factory(UNISWAP_V3_FACTORY);
        poolAddress = factory.getPool(token0, token1, feeTier);

        if (poolAddress == address(0)) {
            // Set initial price so that token0/token1 reflects amount0Desired/amount1Desired
            uint160 sqrtPriceX96 = _getSqrtPriceX96(amount0Desired, amount1Desired);
            poolAddress = factory.createPool(token0, token1, feeTier);
            if (poolAddress == address(0)) revert PoolCreationFailed();
            IUniswapV3Pool(poolAddress).initialize(sqrtPriceX96);
        }

        IERC20(token0).approve(NONFUNGIBLE_POSITION_MANAGER, amount0Desired);
        IERC20(token1).approve(NONFUNGIBLE_POSITION_MANAGER, amount1Desired);

        // Safe tick calculation
        {
            int24 tickSpacing;
            if (feeTier == 100) {
                tickSpacing = 1;
            } else if (feeTier == 500) {
                tickSpacing = 10;
            } else if (feeTier == 3000) {
                tickSpacing = 60;
            } else if (feeTier == 10000) {
                tickSpacing = 200;
            } else {
                // default to 60 to avoid revert on uncommon fee tiers
                tickSpacing = 60;
            }
            int24 currentTick = TickMath.getTickAtSqrtRatio(_getSqrtPriceX96(amount0Desired, amount1Desired));

            // Create a wider range around the current price (10 tick spacings on each side)
            int24 tickLower = ((currentTick - (tickSpacing * 10)) / tickSpacing) * tickSpacing;
            int24 tickUpper = ((currentTick + (tickSpacing * 10)) / tickSpacing) * tickSpacing;

            require(tickLower < tickUpper, "Invalid tick range");

            INonfungiblePositionManager.MintParams memory params =
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: feeTier,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired: amount0Desired,
                    amount1Desired: amount1Desired,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: createPoolMsg.creator,
                    deadline: block.timestamp + 300
                });

            (, , amount0, amount1) = INonfungiblePositionManager(NONFUNGIBLE_POSITION_MANAGER).mint(params);
            refundedAmount0 = createPoolMsg.amount0Desired - amount0;
            refundedAmount1 = createPoolMsg.amount1Desired - amount1;
        }
        return (poolAddress, amount0, amount1, refundedAmount0, refundedAmount1);
    }

    function _getFactory() internal view virtual override returns (address) {
        return UNISWAP_V3_FACTORY;
    }

    function _getRouter() internal view virtual override returns (address) {
        return NONFUNGIBLE_POSITION_MANAGER;
    }

    function _getSqrtPriceX96(uint256 amount1, uint256 amount0) internal pure returns (uint160 sqrtPriceX96) {
        if (amount0 == 0) revert InvalidAmount();
        if (amount1 == 0) return 0;

        uint256 priceX128 = (amount1 << 128) / amount0;
        uint256 sqrtPriceX64 = _sqrt(priceX128);
        uint256 result = sqrtPriceX64 << 32;
        require(result <= type(uint160).max, "R");
        sqrtPriceX96 = uint160(result);
    }

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
