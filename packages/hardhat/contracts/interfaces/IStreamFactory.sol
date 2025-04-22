// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../types/StreamTypes.sol";
import "../lib/math/DecimalMath.sol";
import "../types/StreamFactoryTypes.sol";

interface IStreamFactory {
    // Constructor parameters struct
    struct ConstructorParams {
        uint256 streamCreationFee;
        address streamCreationFeeToken;
        Decimal exitFeeRatio;
        uint256 minWaitingDuration;
        uint256 minBootstrappingDuration;
        uint256 minStreamDuration;
        address[] acceptedInSupplyTokens;
        address feeCollector;
        address protocolAdmin;
        string tosVersion;
        address uniswapV2FactoryAddress;
        address uniswapV2RouterAddress;
    }

    // UpdateParams parameters struct
    struct UpdateParamsRequest {
        uint256 streamCreationFee;
        Decimal exitFeeRatio;
        uint256 minWaitingDuration;
        uint256 minBootstrappingDuration;
        uint256 minStreamDuration;
        string tosVersion;
    }

    // UpdateAcceptedTokens parameters struct
    struct UpdateTokensRequest {
        address[] tokensToAdd;
        address[] tokensToRemove;
    }

    // CreateStream parameters struct
    struct CreateStreamRequest {
        uint256 streamOutAmount;
        address outSupplyToken;
        uint256 bootstrappingStartTime;
        uint256 streamStartTime;
        uint256 streamEndTime;
        uint256 threshold;
        string name;
        address inSupplyToken;
        string tosVersion;
        bytes32 salt;
        StreamTypes.VestingInfo creatorVestingInfo;
        StreamTypes.VestingInfo beneficiaryVestingInfo;
        StreamTypes.PoolConfig poolConfig;
    }

    function updateParams(UpdateParamsRequest calldata request) external;

    function updateFeeCollector(address _feeCollector) external;

    function updateProtocolAdmin(address _protocolAdmin) external;

    function updateAcceptedTokens(UpdateTokensRequest calldata request) external;

    function createStream(CreateStreamRequest calldata request) external payable;

    function getStreams() external view returns (address[] memory);

    function getStream(uint16 _streamId) external view returns (address);

    function isStream(address _streamAddress) external view returns (bool);

    function getParams() external view returns (StreamFactoryTypes.Params memory);

    function isAcceptedInSupplyToken(address token) external view returns (bool);

    function getAcceptedInSupplyTokens() external view returns (address[] memory);

    function setFrozen(bool _frozen) external;

    function predictAddress(address creator, bytes32 _salt, bytes32 bytecodeHash) external pure returns (address);
}
