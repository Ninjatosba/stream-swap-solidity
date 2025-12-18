// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPoolWrapperErrors
 * @dev Interface for custom errors used in the PoolWrapper contract
 */
interface IPoolWrapperErrors {
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientBalance();
    error PoolCreationFailed();
    error DifferentTokensRequired();
} 