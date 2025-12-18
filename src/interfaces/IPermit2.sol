// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPermit2
 * @notice Minimal interface for Uniswap Permit2 used by Stream contract
 * @dev We only include the single-permit allowance flow (PermitSingle) and basic transferFrom
 *      as those are sufficient for subscribeWithPermit. Additional Permit2 functions can be
 *      added later if the protocol needs them.
 */
interface IPermit2 {
    /// @notice Data for a single token allowance
    struct PermitDetails {
        address token;       // ERC20 token address
        uint160 amount;      // allowance amount
        uint48 expiration;   // timestamp at which allowance expires
        uint48 nonce;        // unique nonce to prevent replay
    }

    /// @notice Full permit message for a single token allowance
    struct PermitSingle {
        PermitDetails details; // allowance details
        address spender;       // address being approved to spend the tokens
        uint256 sigDeadline;   // deadline for the signature (timestamp)
    }

    /**
     * @notice Approve token allowance via EIP-712 signature
     * @param owner The owner of the tokens and signer of the permit
     * @param permitSingle Full permit data
     * @param signature Signature over the permit data
     */
    function permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature) external;

    /**
     * @notice Transfer tokens using an existing Permit2 allowance
     * @param from Token owner
     * @param to Recipient
     * @param amount Amount to transfer (uint160 per Permit2 spec)
     * @param token ERC20 token address
     */
    function transferFrom(address from, address to, uint160 amount, address token) external;
} 