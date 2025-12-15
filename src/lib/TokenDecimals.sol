// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title TokenDecimals
 * @notice Library for safely querying token decimals with fallback
 * @dev Handles ERC20 tokens with and without IERC20Metadata, as well as native tokens
 */
library TokenDecimals {
    /// @notice Default decimals for tokens without decimals() function or native tokens
    uint8 public constant DEFAULT_DECIMALS = 18;

    /**
     * @dev Safely queries token decimals with fallback
     * @param token Token address (address(0) for native token)
     * @return decimals Number of decimals (defaults to 18 if query fails)
     */
    function getDecimals(address token) internal view returns (uint8) {
        // Native token (ETH) uses 18 decimals
        if (token == address(0)) {
            return DEFAULT_DECIMALS;
        }

        // Try to query decimals from IERC20Metadata
        // Use low-level call to handle tokens without decimals() function
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSelector(IERC20Metadata.decimals.selector)
        );

        if (success && data.length >= 32) {
            uint8 decimals = abi.decode(data, (uint8));
            // Validate decimals is reasonable (0-18 is standard, but allow up to 255)
            return decimals;
        }

        // Fallback to default (18 decimals) if query fails
        return DEFAULT_DECIMALS;
    }
}

