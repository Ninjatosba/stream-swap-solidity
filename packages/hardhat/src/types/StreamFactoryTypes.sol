// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Decimal } from "../lib/math/DecimalMath.sol";

library StreamFactoryTypes {
    struct Params {
        uint256 streamCreationFee;
        address streamCreationFeeToken;
        Decimal exitFeeRatio;
        uint256 minWaitingDuration;
        uint256 minBootstrappingDuration;
        uint256 minStreamDuration;
        address feeCollector;
        address protocolAdmin;
        string tosVersion;
        address vestingFactoryAddress;
        address poolWrapperAddress;
        address streamImplementationAddress;
        address tokenFactoryAddress;
    }

    struct InitializeStreamMessage {
        uint256 streamCreationFee;
        address streamCreationFeeToken;
        Decimal exitFeeRatio;
        uint256 minWaitingDuration;
        uint256 minBootstrappingDuration;
        uint256 minStreamDuration;
        address feeCollector;
        address protocolAdmin;
        string tosVersion;
        address poolWrapperAddress;
        address streamImplementationAddress;
        address[] acceptedInSupplyTokens;
        address tokenFactoryAddress;
    }
}
