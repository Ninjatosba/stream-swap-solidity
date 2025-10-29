// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PoolWrapper } from "./PoolWrapper.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IAerodromeFactory, IAerodromeRouter } from "./interfaces/IAerodrome.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title AerodromePoolWrapper
 * @notice Wrapper for Aerodrome AMM pools on Base network
 * @dev Supports both stable and volatile pools with different fee structures
 */
contract AerodromePoolWrapper is PoolWrapper {
    address public immutable AERODROME_FACTORY;
    address public immutable AERODROME_ROUTER;
    bool public immutable STABLE_POOL; // true for stable pools, false for volatile

    constructor(
        address factory,
        address router,
        bool stable
    ) {
        if (factory == address(0)) revert InvalidAddress();
        if (router == address(0)) revert InvalidAddress();

        AERODROME_FACTORY = factory;
        AERODROME_ROUTER = router;
        STABLE_POOL = stable;
    }

    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual override returns (
        address poolAddress,
        uint256 amount0,
        uint256 amount1,
        uint256 refundedAmount0,
        uint256 refundedAmount1
    ) {
        IAerodromeFactory factory = IAerodromeFactory(AERODROME_FACTORY);
        IAerodromeRouter router = IAerodromeRouter(AERODROME_ROUTER);

        // Check if pool already exists
        address existingPool = factory.getPool(createPoolMsg.token0, createPoolMsg.token1, STABLE_POOL);
        if (existingPool == address(0)) {
            // Create new pool
            poolAddress = factory.createPool(createPoolMsg.token0, createPoolMsg.token1, STABLE_POOL);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        } else {
            poolAddress = existingPool;
        }

        // Approve router to spend tokens
        IERC20(createPoolMsg.token0).approve(AERODROME_ROUTER, createPoolMsg.amount0Desired);
        IERC20(createPoolMsg.token1).approve(AERODROME_ROUTER, createPoolMsg.amount1Desired);

        // Add liquidity
        (amount0, amount1, ) = router.addLiquidity(
            createPoolMsg.token0,
            createPoolMsg.token1,
            STABLE_POOL,
            createPoolMsg.amount0Desired,
            createPoolMsg.amount1Desired,
            0, // amountAMin - using 0 for simplicity, can be made configurable
            0, // amountBMin - using 0 for simplicity, can be made configurable
            createPoolMsg.creator,
            block.timestamp + 300 // deadline - 5 minutes from now
        );

        // Calculate refunds
        refundedAmount0 = createPoolMsg.amount0Desired - amount0;
        refundedAmount1 = createPoolMsg.amount1Desired - amount1;

        return (poolAddress, amount0, amount1, refundedAmount0, refundedAmount1);
    }

    function _getFactory() internal view virtual override returns (address) {
        return AERODROME_FACTORY;
    }

    function _getRouter() internal view virtual override returns (address) {
        return AERODROME_ROUTER;
    }

    /**
     * @notice Get pool type information
     * @return isStable True if this wrapper creates stable pools
     */
    function getPoolType() external view returns (bool isStable) {
        return STABLE_POOL;
    }

    /**
     * @notice Get the pool address for given tokens without creating it
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return pool The pool address if it exists, address(0) otherwise
     */
    function getPair(address tokenA, address tokenB) external view returns (address pool) {
        return IAerodromeFactory(AERODROME_FACTORY).getPool(tokenA, tokenB, STABLE_POOL);
    }
}
