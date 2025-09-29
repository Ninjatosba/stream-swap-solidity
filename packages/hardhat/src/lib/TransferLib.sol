// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TransferLib
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Library for handling both ERC20 and native token transfers
 * @dev Provides a unified interface for token transfers, automatically detecting
 *      whether to use ERC20 transfers or native ETH transfers based on token address.
 *
 * Functions are neutral: you specify both `from` and `to`. If `from == msg.sender`
 * and `to == address(this)`, it behaves like a pull. If `from == address(this)` and
 * `to != address(this)`, it behaves like a push. From → To is always explicit.
 */
library TransferLib {
    using SafeERC20 for IERC20;

    /// @notice Native token address (zero address)
    address public constant NATIVE_TOKEN = address(0);

    /**
     * @dev Moves funds from `from` to `to`. Supports native token and ERC20.
     * @param token Token address (zero address for native token)
     * @param from Address to debit funds from (msg.sender for native token)
     * @param to Address to credit funds to
     * @param amount Amount to transfer
     */
    function transferFunds(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) return;

        if (token == NATIVE_TOKEN) {
            if (from != msg.sender) revert InvalidNativePayer(from);
            if (msg.value != amount) revert IncorrectNativeAmount(amount, msg.value);

            // If destination is contract itself, just accept ETH
            if (to == address(this)) return;

            // Otherwise forward directly
            (bool success, ) = to.call{ value: amount }("");
            if (!success) revert NativeTokenTransferFailed();
            return;
        }

        // ERC20
        if (from == address(this)) {
            IERC20(token).safeTransfer(to, amount);
        } else {
            // pull directly into `to`
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    // ============ Errors ============
    error NativeTokenTransferFailed();
    error IncorrectNativeAmount(uint256 expected, uint256 actual);
    error InvalidNativePayer(address from);
}
