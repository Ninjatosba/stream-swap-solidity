// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VestingFactory
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Factory for creating OpenZeppelin VestingWallet instances for stream participants
 * @dev This contract creates vesting wallets for post-stream token distribution:
 *      - Creates VestingWallet instances using OpenZeppelin's audited implementation
 *      - Handles token transfers to newly created vesting contracts
 *      - Used for both creator and beneficiary vesting scenarios
 *      - Ensures secure and standardized vesting functionality
 */

import { VestingWallet } from "@openzeppelin/contracts/finance/VestingWallet.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TransferLib } from "./lib/TransferLib.sol";

/**
 * @title VestingFactory
 * @dev Factory contract for creating OpenZeppelin VestingWallet instances
 */
contract VestingFactory {
    using SafeERC20 for IERC20;

    // Custom errors
    error InvalidBeneficiary();
    error InvalidStartTime();
    error InvalidDuration();
    error InvalidAmount();
    error TokenTransferFailed();

    event VestingWalletCreated(
        address indexed beneficiary,
        address indexed vestingWallet,
        uint64 startTime,
        uint64 duration,
        address token,
        uint256 amount
    );

    /**
     * @dev Creates a VestingWallet and transfers tokens to it in one transaction
     * @param beneficiary address of the beneficiary
     * @param startTime the time (as Unix time) at which point vesting begins
     * @param duration duration in seconds of the period in which the tokens will vest
     * @param token the token to transfer to the vesting wallet (zero address for native token)
     * @param amount the amount of tokens to transfer
     * @return vestingWallet the address of the created VestingWallet
     * @notice When token is address(0), native tokens are sent via msg.value. For ERC20 tokens, 
     *         the caller must approve this contract first.
     */
    function createVestingWalletWithTokens(
        address beneficiary,
        uint64 startTime,
        uint64 duration,
        address token,
        uint256 amount
    ) external payable returns (address vestingWallet) {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (startTime == 0) revert InvalidStartTime();
        if (startTime < block.timestamp) revert InvalidStartTime();
        if (duration == 0) revert InvalidDuration();
        if (amount == 0) revert InvalidAmount();

        // Create the vesting wallet
        vestingWallet = address(new VestingWallet(beneficiary, startTime, duration));

        // Transfer tokens (native or ERC20) to the vesting wallet using shared lib
        // For native, this enforces msg.value == amount and handles sending safely.
        TransferLib.transferFunds(token, msg.sender, vestingWallet, amount);

        emit VestingWalletCreated(beneficiary, vestingWallet, startTime, duration, token, amount);
        return vestingWallet;
    }
}
