// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IPoolWrapperErrors } from "./interfaces/IPoolWrapperErrors.sol";

abstract contract PoolWrapper is Ownable, IPoolWrapperErrors {
    using SafeERC20 for IERC20;

    // Mapping from stream address to pool info
    mapping(address => PoolWrapperTypes.CreatedPoolInfo) public streamPools;

    event PoolCreated(
        address indexed stream,
        address indexed pool,
        address indexed poolWrapper,
        address token0,
        address token1,
        uint256 token0Amount,
        uint256 token1Amount
    );

    constructor() Ownable() {}

    /**
     * @notice Creates a pool and adds liquidity
     * @param createPoolMsg The parameters for pool creation and liquidity addition
     * Callable by anyone
     */
    function createPool(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) external returns (PoolWrapperTypes.CreatedPoolInfo memory) {
        // Validate that the tokens are valid ERC20s
        if (createPoolMsg.token0 == address(0)) revert InvalidAddress();
        if (createPoolMsg.token1 == address(0)) revert InvalidAddress();
        if (createPoolMsg.token0 == createPoolMsg.token1) revert DifferentTokensRequired();
        if (createPoolMsg.amount0 == 0) revert InvalidAmount();
        if (createPoolMsg.amount1 == 0) revert InvalidAmount();

        // Validate that the tokens are sent to this contract
        if (IERC20(createPoolMsg.token0).balanceOf(address(this)) < createPoolMsg.amount0) {
            revert InsufficientBalance();
        }
        if (IERC20(createPoolMsg.token1).balanceOf(address(this)) < createPoolMsg.amount1) {
            revert InsufficientBalance();
        }

        // DEX-specific pool creation and liquidity addition
        (address poolAddress, uint256 amountA, uint256 amountB) = _createPoolInternal(createPoolMsg);

        // Store the pool info
        PoolWrapperTypes.CreatedPoolInfo memory poolInfo = PoolWrapperTypes.CreatedPoolInfo({
            poolAddress: poolAddress,
            token0: createPoolMsg.token0,
            token1: createPoolMsg.token1
        });

        streamPools[msg.sender] = poolInfo;

        // Emit events
        emit PoolCreated(
            msg.sender,
            poolAddress,
            address(this),
            createPoolMsg.token0,
            createPoolMsg.token1,
            amountA,
            amountB
        );

        return poolInfo;
    }

    /**
     * @notice Gets pool info for a stream
     * @param stream The stream address
     */
    function getPoolInfo(address stream) external view returns (PoolWrapperTypes.CreatedPoolInfo memory) {
        return streamPools[stream];
    }

    /**
     * @dev Abstract method for DEX-specific pool creation and liquidity addition
     * @param createPoolMsg The pool creation parameters
     * @return poolAddress The address of the created pool
     * @return amountA The actual amount of token0 added
     * @return amountB The actual amount of token1 added
     */
    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual returns (address poolAddress, uint256 amountA, uint256 amountB);

    /**
     * @dev Abstract method to get the DEX factory address
     */
    function _getFactory() internal view virtual returns (address);

    /**
     * @dev Abstract method to get the DEX router address
     */
    function _getRouter() internal view virtual returns (address);
}
