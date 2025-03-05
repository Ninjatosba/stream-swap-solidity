// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IStreamErrors {
    error InvalidBootstrappingStartTime();
    error InvalidStreamStartTime();
    error InvalidStreamEndTime();
    error StreamDurationTooShort();
    error BootstrappingDurationTooShort();
    error WaitingDurationTooShort();
    error InsufficientTokenPayment(uint256 requiredTokenAmount, uint256 tokenBalance);
    error InvalidStreamOutDenom();
    error InvalidStreamInDenom();
    error InvalidInDenom();
    error PaymentFailed();
    error OperationNotAllowed();
    error Unauthorized();
    error InvalidWithdrawAmount();
    error WithdrawAmountExceedsBalance(uint256 cap);
    error InsufficientOutAmount();
} 