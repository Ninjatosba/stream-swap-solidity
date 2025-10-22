// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IPoolWrapperErrors } from "./interfaces/IPoolWrapperErrors.sol";
import { TransferLib } from "./lib/TransferLib.sol";
import "hardhat/console.sol";

abstract contract PoolWrapper is Ownable, IPoolWrapperErrors {
    using SafeERC20 for IERC20;

    // Mapping from stream address to pool info
    mapping(address => PoolWrapperTypes.CreatedPoolInfo) public streamPools;

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
        if (createPoolMsg.amount0Desired == 0) revert InvalidAmount();
        if (createPoolMsg.amount1Desired == 0) revert InvalidAmount();
        if (createPoolMsg.creator == address(0)) revert InvalidAddress();

        // Validate that the tokens are sent to this contract
        if (IERC20(createPoolMsg.token0).balanceOf(address(this)) < createPoolMsg.amount0Desired) {
            revert InsufficientBalance();
        }
        if (IERC20(createPoolMsg.token1).balanceOf(address(this)) < createPoolMsg.amount1Desired) {
            revert InsufficientBalance();
        }

        // DEX-specific pool creation and liquidity addition
        (address poolAddress, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1) = _createPoolInternal(createPoolMsg);

        // Store the pool info
        PoolWrapperTypes.CreatedPoolInfo memory poolInfo = PoolWrapperTypes.CreatedPoolInfo({
            poolAddress: poolAddress,
            token0: createPoolMsg.token0,
            token1: createPoolMsg.token1,
            amount0: amount0,
            amount1: amount1,
            creator: createPoolMsg.creator,
            refundedAmount0: refundedAmount0,
            refundedAmount1: refundedAmount1
        });

        // Send refunded tokens to the creator
        TransferLib.transferFunds(createPoolMsg.token0, address(this), createPoolMsg.creator, refundedAmount0);
        TransferLib.transferFunds(createPoolMsg.token1, address(this), createPoolMsg.creator, refundedAmount1);

        streamPools[msg.sender] = poolInfo;
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
     * @return amount0 The actual amount of token0 added
     * @return amount1 The actual amount of token1 added
     * @return refundedAmount0 The amount of token0 refunded
     * @return refundedAmount1 The amount of token1 refunded
     */
    function _createPoolInternal(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) internal virtual returns (address poolAddress, uint256 amount0, uint256 amount1, uint256 refundedAmount0, uint256 refundedAmount1);

    /**
     * @dev Abstract method to get the DEX factory address
     */
    function _getFactory() internal view virtual returns (address);

    /**
     * @dev Abstract method to get the DEX router address
     */
    function _getRouter() internal view virtual returns (address);
}
