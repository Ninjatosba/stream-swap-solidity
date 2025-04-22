// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../lib/math/DecimalMath.sol";

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
        address vestingAddress;
        address uniswapV2FactoryAddress;
        address uniswapV2RouterAddress;
    }
}
