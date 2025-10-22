// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
    error TokenTransferFailed();
    error StreamAddressPredictionFailed();
    error InvalidFeeCollector();
    error InvalidProtocolAdmin();
    error NotAdmin();
    error InvalidPoolWrapper();
    error PoolWrapperNotSet();
    error InvalidImplementationAddress();
    error InvalidStreamCreationFeeToken();
    error AlreadyInitialized();
    error InvalidAcceptedInSupplyTokens();
    error InvalidStreamImplementationAddress();
    error InvalidOutSupplyToken();
    error InvalidCreator();
    error InvalidVestingDuration();
    error SameInputAndOutputToken();
    error InvalidTokenName();
    error InvalidTokenSymbol();
    error InvalidTokenDecimals();
    error InvalidTokenSupply();
    error InvalidTokenTotalSupply();
    error InvalidDexType();
}
