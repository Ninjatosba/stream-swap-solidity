// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TransferLib
 * @author Adnan Deniz
 * @notice Unified handling of ERC20 and native transfers.
 * @dev Supports both fresh ETH via msg.value and already-held ETH in contract.
 */
library TransferLib {
    using SafeERC20 for IERC20;

    /// @notice Native token address (zero address)
    address public constant NATIVE_TOKEN = address(0);

    /**
     * @dev Transfer funds from `from` to `to`. Works with native token and ERC20.
     * @param token Token address (zero address for native token)
     * @param from Address providing funds (msg.sender or this for native, any for ERC20)
     * @param to Address receiving funds
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
            if (from == msg.sender) {
                // Pulling fresh ETH
                if (msg.value != amount) revert IncorrectNativeAmount(amount, msg.value);
                if (to == address(this)) return; // staying in contract
                (bool ok, ) = payable(to).call{ value: amount }("");
                if (!ok) revert NativeTokenTransferFailed();
            } else if (from == address(this)) {
                // Sending ETH already held by contract
                (bool ok, ) = payable(to).call{ value: amount }("");
                if (!ok) revert NativeTokenTransferFailed();
            } else {
                revert InvalidNativePayer(from);
            }
            return;
        }

        // ERC20 path
        if (from == address(this)) {
            IERC20(token).safeTransfer(to, amount);
        } else {
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    // ============ Errors ============
    error NativeTokenTransferFailed();
    error IncorrectNativeAmount(uint256 expected, uint256 actual);
    error InvalidNativePayer(address from);
}
