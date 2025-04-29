// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// StreamFactory errors
interface IStreamFactoryErrors {
    // StreamFactory errors
    error InvalidBootstrappingStartTime();
    error InvalidStreamStartTime();
    error InvalidStreamEndTime();
    error StreamDurationTooShort();
    error BootstrappingDurationTooShort();
    error WaitingDurationTooShort();
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
    error InvalidPoolWrapper();
}
