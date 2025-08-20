// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TransferLib
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Library for handling both ERC20 and native token transfers
 * @dev Provides a unified interface for token transfers, automatically detecting
 *      whether to use ERC20 transfers or native ETH transfers based on token address
 */
library TransferLib {
    using SafeERC20 for IERC20;

    /// @notice Native token address (zero address)
    address public constant NATIVE_TOKEN = address(0);

    /**
     * @dev Transfers tokens from one address to another
     * @param token Token address (zero address for native token)
     * @param from Source address
     * @param to Destination address
     * @param amount Amount to transfer
     */
    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (token == NATIVE_TOKEN) {
            // Native token transfer
            if (from != address(this)) {
                // If from is not this contract, we need to receive the native tokens first
                // This should be handled by the caller sending the native tokens with the transaction
                if (msg.value < amount) revert InsufficientNativeTokenAmount();
            }
            
            // Transfer native tokens to destination
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert NativeTokenTransferFailed();
        } else {
            // ERC20 token transfer
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    /**
     * @dev Transfers tokens from this contract to another address
     * @param token Token address (zero address for native token)
     * @param to Destination address
     * @param amount Amount to transfer
     */
    function transfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        if (token == NATIVE_TOKEN) {
            // Native token transfer
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert NativeTokenTransferFailed();
        } else {
            // ERC20 token transfer
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /**
     * @dev Gets the balance of tokens for an address
     * @param token Token address (zero address for native token)
     * @param account Address to check balance for
     * @return Balance amount
     */
    function balanceOf(address token, address account) internal view returns (uint256) {
        if (token == NATIVE_TOKEN) {
            return account.balance;
        } else {
            return IERC20(token).balanceOf(account);
        }
    }

    /**
     * @dev Gets the allowance for ERC20 tokens (returns 0 for native tokens)
     * @param token Token address (zero address for native token)
     * @param owner Owner address
     * @param spender Spender address
     * @return Allowance amount
     */
    function allowance(
        address token,
        address owner,
        address spender
    ) internal view returns (uint256) {
        if (token == NATIVE_TOKEN) {
            return 0; // Native tokens don't have allowance concept
        } else {
            return IERC20(token).allowance(owner, spender);
        }
    }

    // ============ Errors ============

    error InsufficientNativeTokenAmount();
        error NativeTokenTransferFailed();
}
