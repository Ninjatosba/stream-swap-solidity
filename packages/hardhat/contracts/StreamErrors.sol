// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IStreamErrors {
    // Stream errors
    error InvalidBootstrappingStartTime();
    error InvalidStreamStartTime();
    error InvalidStreamEndTime();
    error StreamDurationTooShort();
    error BootstrappingDurationTooShort();
    error WaitingDurationTooShort();
    error InsufficientTokenPayment(uint256 requiredTokenAmount, uint256 tokenBalance);
    error InvalidOutSupplyToken();
    error InvalidInSupplyToken();
    error PaymentFailed();
    error OperationNotAllowed();
    error Unauthorized();
    error InvalidWithdrawAmount();
    error WithdrawAmountExceedsBalance(uint256 cap);
    error InsufficientOutAmount();
    error InvalidPosition();
    error InvalidExitCondition();
    // StreamFactory errors
    error ContractFrozen();
    error InvalidExitFeeRatio();
    error ZeroOutSupplyNotAllowed();
    error StreamInputTokenNotAccepted();
    error InvalidBootstrappingTime();
    error StreamStartMustBeAfterBootstrapping();
    error StreamEndMustBeAfterStart();
    error InvalidToSVersion();
    error InsufficientNativeToken();
    error FeeTransferFailed();
    error TokenTransferFailed();
    error StreamAddressPredictionFailed();
    error InvalidFeeCollector();
    error InvalidProtocolAdmin();
    error NotAdmin();
}
