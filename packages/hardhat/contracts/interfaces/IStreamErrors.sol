// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

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
    error InvalidAmount();
    error StreamFactoryAddressAlreadySet();
    error InvalidStreamFactoryAddress();
    error InvalidImplementationAddress();
}
