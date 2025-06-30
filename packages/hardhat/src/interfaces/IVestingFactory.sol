// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IVestingFactory
 * @dev Interface for the VestingFactory contract that creates OpenZeppelin VestingWallet instances
 */
interface IVestingFactory {
    /**
     * @dev Creates a VestingWallet and transfers tokens to it in one transaction
     * @param beneficiary address of the beneficiary
     * @param startTime the time (as Unix time) at which point vesting begins
     * @param duration duration in seconds of the period in which the tokens will vest
     * @param token the ERC20 token to transfer to the vesting wallet
     * @param amount the amount of tokens to transfer
     * @return vestingWallet the address of the created VestingWallet
     */
    function createVestingWalletWithTokens(
        address beneficiary,
        uint64 startTime,
        uint64 duration,
        address token,
        uint256 amount
    ) external returns (address vestingWallet);

    /**
     * @dev Event emitted when a new VestingWallet is created
     */
    event VestingWalletCreated(
        address indexed beneficiary,
        address indexed vestingWallet,
        uint64 startTime,
        uint64 duration,
        address token,
        uint256 amount
    );
}
