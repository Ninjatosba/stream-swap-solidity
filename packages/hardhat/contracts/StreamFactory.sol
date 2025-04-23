// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./Stream.sol";
import "./interfaces/IStreamEvents.sol";
import "./interfaces/IStreamFactoryErrors.sol";
import "./Vesting.sol";
import "./types/StreamTypes.sol";
import "./interfaces/IVesting.sol";
import "hardhat/console.sol";
import "./types/StreamFactoryTypes.sol";

contract StreamFactory is IStreamEvents, IStreamFactoryErrors {
    mapping(address => bool) public acceptedInSupplyTokens;

    address public constant NATIVE_TOKEN = address(0);

    uint16 public currentStreamId;

    StreamFactoryTypes.Params public params;
    mapping(uint16 => address) public streamAddresses;

    bool public frozen;

    constructor(StreamFactoryTypes.constructFactoryMessage memory constructFactoryMessage) {
        if (constructFactoryMessage.feeCollector == address(0)) revert InvalidFeeCollector();
        if (constructFactoryMessage.protocolAdmin == address(0)) revert InvalidProtocolAdmin();

        // Check if exit fee ratio is between 0 and 1
        if (DecimalMath.gt(constructFactoryMessage.exitFeeRatio, DecimalMath.fromNumber(1)))
            revert InvalidExitFeeRatio();

        // Deploy vesting contract
        Vesting vesting = new Vesting();

        // Emit event for vesting contract deployment
        emit VestingContractDeployed(address(this), address(vesting));

        params = StreamFactoryTypes.Params({
            streamCreationFee: constructFactoryMessage.streamCreationFee,
            streamCreationFeeToken: constructFactoryMessage.streamCreationFeeToken,
            exitFeeRatio: constructFactoryMessage.exitFeeRatio,
            minWaitingDuration: constructFactoryMessage.minWaitingDuration,
            minBootstrappingDuration: constructFactoryMessage.minBootstrappingDuration,
            minStreamDuration: constructFactoryMessage.minStreamDuration,
            feeCollector: constructFactoryMessage.feeCollector,
            protocolAdmin: constructFactoryMessage.protocolAdmin,
            tosVersion: constructFactoryMessage.tosVersion,
            vestingAddress: address(vesting),
            uniswapV2FactoryAddress: constructFactoryMessage.uniswapV2FactoryAddress,
            uniswapV2RouterAddress: constructFactoryMessage.uniswapV2RouterAddress
        });

        // Set accepted tokens
        for (uint i = 0; i < constructFactoryMessage.acceptedInSupplyTokens.length; i++) {
            acceptedInSupplyTokens[constructFactoryMessage.acceptedInSupplyTokens[i]] = true;
        }
        currentStreamId = 0;
    }

    modifier onlyAdmin() {
        if (msg.sender != params.protocolAdmin) revert NotAdmin();
        _;
    }

    function updateParams(
        uint256 _streamCreationFee,
        Decimal memory _exitFeeRatio,
        uint256 _minWaitingDuration,
        uint256 _minBootstrappingDuration,
        uint256 _minStreamDuration,
        string memory _tosVersion
    ) external onlyAdmin {
        params.streamCreationFee = _streamCreationFee;
        params.exitFeeRatio = _exitFeeRatio;
        params.minWaitingDuration = _minWaitingDuration;
        params.minBootstrappingDuration = _minBootstrappingDuration;
        params.minStreamDuration = _minStreamDuration;
        params.tosVersion = _tosVersion;

        emit ParamsUpdated(
            address(this),
            _streamCreationFee,
            _exitFeeRatio.value,
            _minWaitingDuration,
            _minBootstrappingDuration,
            _minStreamDuration,
            _tosVersion
        );
    }

    function updateFeeCollector(address _feeCollector) external onlyAdmin {
        if (_feeCollector == address(0)) revert InvalidFeeCollector();
        params.feeCollector = _feeCollector;
        emit FeeCollectorUpdated(address(this), _feeCollector);
    }

    function updateProtocolAdmin(address _protocolAdmin) external onlyAdmin {
        if (_protocolAdmin == address(0)) revert InvalidProtocolAdmin();
        params.protocolAdmin = _protocolAdmin;
        emit ProtocolAdminUpdated(address(this), _protocolAdmin);
    }

    function updateAcceptedTokens(
        address[] calldata tokens_to_add,
        address[] calldata tokens_to_remove
    ) external onlyAdmin {
        for (uint i = 0; i < tokens_to_add.length; i++) {
            acceptedInSupplyTokens[tokens_to_add[i]] = true;
        }
        for (uint i = 0; i < tokens_to_remove.length; i++) {
            acceptedInSupplyTokens[tokens_to_remove[i]] = false;
        }
        emit AcceptedTokensUpdated(address(this), tokens_to_add, tokens_to_remove);
    }

    function createStream(StreamTypes.createStreamMessage memory createStreamMessage) external payable {
        // Check if contract is accepting new streams (not frozen)
        if (frozen) revert ContractFrozen();

        // Validate input parameters
        if (createStreamMessage.streamOutAmount == 0) revert ZeroOutSupplyNotAllowed();
        if (!acceptedInSupplyTokens[createStreamMessage.inSupplyToken]) revert StreamInputTokenNotAccepted();

        // Validate time parameters using validateStreamTimes
        validateStreamTimes(
            block.timestamp,
            createStreamMessage.bootstrappingStartTime,
            createStreamMessage.streamStartTime,
            createStreamMessage.streamEndTime
        );

        // Validate TOS version
        if (
            keccak256(abi.encodePacked(createStreamMessage.tosVersion)) !=
            keccak256(abi.encodePacked(params.tosVersion))
        ) revert InvalidToSVersion();

        // Load creation fee
        uint256 creationFee = params.streamCreationFee;
        if (creationFee > 0) {
            if (params.streamCreationFeeToken == address(0)) {
                // Native token
                if (msg.value < creationFee) revert InsufficientNativeToken();
                // Transfer fee to fee collector
                if (!payable(params.feeCollector).send(creationFee)) revert FeeTransferFailed();
            } else {
                // ERC20 token
                if (
                    !IERC20(params.streamCreationFeeToken).transferFrom(
                        msg.sender,
                        address(params.feeCollector),
                        creationFee
                    )
                ) revert TokenTransferFailed();
            }
        }
        // Predict stream address
        bytes32 bytecodeHash = keccak256(abi.encodePacked(type(Stream).creationCode, abi.encode(createStreamMessage)));

        address predictedAddress = predictAddress(address(this), createStreamMessage.salt, bytecodeHash);
        // Transfer out denom to stream contract
        if (
            !IERC20(createStreamMessage.outSupplyToken).transferFrom(
                msg.sender,
                predictedAddress,
                createStreamMessage.streamOutAmount + createStreamMessage.poolInfo.poolOutSupplyAmount
            )
        ) revert TokenTransferFailed();

        // Deploy new stream contract with all parameters
        Stream stream = new Stream{ salt: createStreamMessage.salt }(createStreamMessage);

        if (address(stream) != predictedAddress) revert StreamAddressPredictionFailed();
        streamAddresses[currentStreamId] = address(stream);

        emit StreamCreated(
            createStreamMessage.outSupplyToken,
            createStreamMessage.inSupplyToken,
            address(this),
            createStreamMessage.streamOutAmount,
            createStreamMessage.bootstrappingStartTime,
            createStreamMessage.streamStartTime,
            createStreamMessage.streamEndTime,
            createStreamMessage.threshold,
            createStreamMessage.name,
            params.tosVersion,
            address(stream),
            currentStreamId
        );
        currentStreamId++;
    }

    function getStreams() external view returns (address[] memory) {
        address[] memory streams = new address[](currentStreamId);
        for (uint16 i = 0; i < currentStreamId; i++) {
            streams[i] = streamAddresses[i];
        }
        return streams;
    }

    function getStream(uint16 _streamId) external view returns (address) {
        return streamAddresses[_streamId];
    }

    function isStream(address _streamAddress) external view returns (bool) {
        for (uint16 i = 0; i < currentStreamId; i++) {
            if (streamAddresses[i] == _streamAddress) {
                return true;
            }
        }
        return false;
    }

    function getParams() external view returns (StreamFactoryTypes.Params memory) {
        return params;
    }

    function isAcceptedInSupplyToken(address token) public view returns (bool) {
        return acceptedInSupplyTokens[token];
    }

    function getAcceptedInSupplyTokens() external view returns (address[] memory) {
        address[] memory tokens = new address[](currentStreamId);
        for (uint16 i = 0; i < currentStreamId; i++) {
            if (acceptedInSupplyTokens[streamAddresses[i]]) {
                tokens[i] = streamAddresses[i];
            }
        }
        return tokens;
    }

    function setFrozen(bool _frozen) external onlyAdmin {
        frozen = _frozen;
        emit FrozenStateUpdated(address(this), _frozen);
    }

    function predictAddress(address creator, bytes32 _salt, bytes32 bytecodeHash) public pure returns (address) {
        return address(uint160(uint(keccak256(abi.encodePacked(bytes1(0xff), creator, _salt, bytecodeHash)))));
    }

    function validateStreamTimes(
        uint256 nowTime,
        uint256 _bootstrappingStartTime,
        uint256 _startTime,
        uint256 _endTime
    ) internal view {
        if (nowTime > _bootstrappingStartTime) revert InvalidBootstrappingStartTime();
        if (_bootstrappingStartTime > _startTime) revert InvalidStreamStartTime();
        if (_startTime > _endTime) revert InvalidStreamEndTime();
        if (_endTime - _startTime < params.minStreamDuration) revert StreamDurationTooShort();
        if (_startTime - _bootstrappingStartTime < params.minBootstrappingDuration)
            revert BootstrappingDurationTooShort();
        if (_bootstrappingStartTime - nowTime < params.minWaitingDuration) revert WaitingDurationTooShort();
    }
}
