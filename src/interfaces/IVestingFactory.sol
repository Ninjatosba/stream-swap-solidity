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
    ) external payable returns (address vestingWallet);

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
