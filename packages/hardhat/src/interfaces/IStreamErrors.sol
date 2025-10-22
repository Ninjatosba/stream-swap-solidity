// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStreamErrors {
    // Stream errors
    error InsufficientTokenPayment(uint256 requiredTokenAmount, uint256 tokenBalance);
    error InvalidOutSupplyToken();
    error InvalidInSupplyToken();
    error PaymentFailed();
    error OperationNotAllowed();
    error Unauthorized();
    error InvalidWithdrawAmount();
    error WithdrawAmountExceedsBalance(uint256 cap);
    error InsufficientOutAmount();
    error InvalidPosition(address user, uint256 shares, uint256 exitDate, string reason);
    error InvalidExitCondition();
    error InvalidVestingDuration();
    error InvalidVestingCliffDuration();
    error InvalidPoolOutSupplyAmount();
    error InvalidPoolType();
    error InvalidAmount();
    error StreamFactoryAddressAlreadySet();
    error InvalidStreamFactoryAddress();
    error InvalidPositionStorageAddress();
    error InvalidImplementationAddress();
    error InvalidInputToken();
    error SameInputAndOutputToken();
    error InvalidDexType();
}
