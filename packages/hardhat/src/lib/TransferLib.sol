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

    // Deprecated helpers removed: transferFrom, transfer, balanceOf, allowance

    /**
     * @dev Pull funds into this contract. Supports native token and ERC20.
     * @param token Token address (zero address for native token)
     * @param payer Address that pays the funds (ignored for native token)
     * @param amount Amount to pull
     */
    function pullFunds(
        address token,
        address payer,
        uint256 amount
    ) internal {
        if (amount == 0) {
            return;
        }

        if (token == NATIVE_TOKEN) {
            if (msg.value != amount) revert IncorrectNativeAmount(amount, msg.value);
            // For native tokens, ETH is already transferred with this call
            return;
        }

        // ERC20
        IERC20(token).safeTransferFrom(payer, address(this), amount);
    }

    /**
     * @dev Push funds from this contract to a recipient. Supports native token and ERC20.
     * @param token Token address (zero address for native token)
     * @param to Recipient address
     * @param amount Amount to push
     */
    function pushFunds(
        address token,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) return;

        if (token == NATIVE_TOKEN) {
            (bool success, ) = to.call{ value: amount }("");
            if (!success) revert NativeTokenTransferFailed();
            return;
        }

        // ERC20
        IERC20(token).safeTransfer(to, amount);
    }

    // ============ Errors ============

    error NativeTokenTransferFailed();
    error IncorrectNativeAmount(uint256 expected, uint256 actual);
}
