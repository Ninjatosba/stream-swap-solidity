// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./Stream.sol";
import "./StreamEvents.sol";
import "./StreamErrors.sol";

contract StreamFactory is IStreamEvents, IStreamErrors {
    struct Params {
        uint256 streamCreationFee; // Fixed fee to create a stream
        address streamCreationFeeToken; // Token used for creation fee,
        uint256 exitFeePercent; // Fee percentage when exiting a stream
        uint256 minWaitingDuration; // Minimum waiting period
        uint256 minBootstrappingDuration; // Minimum bootstrapping period
        uint256 minStreamDuration; // Minimum duration for a stream
        address feeCollector; // Address where fees are collected
        address protocolAdmin; // Admin address for protocol
        string tosVersion; // Terms of service version
    }

    mapping(address => bool) public acceptedInSupplyTokens;

    address public constant NATIVE_TOKEN = address(0);

    uint16 public currentStreamId;

    Params public params;
    mapping(uint16 => address) public streamAddresses;

    bool public frozen;

    constructor(
        uint256 _streamCreationFee,
        address _streamCreationFeeToken,
        uint256 _exitFeePercent,
        uint256 _minWaitingDuration,
        uint256 _minBootstrappingDuration,
        uint256 _minStreamDuration,
        address[] memory _acceptedInSupplyTokens,
        address _feeCollector,
        address _protocolAdmin,
        string memory _tosVersion
    ) {
        if (_feeCollector == address(0)) revert InvalidFeeCollector();
        if (_protocolAdmin == address(0)) revert InvalidProtocolAdmin();

        params = Params({
            streamCreationFee: _streamCreationFee,
            streamCreationFeeToken: _streamCreationFeeToken,
            exitFeePercent: _exitFeePercent,
            minWaitingDuration: _minWaitingDuration,
            minBootstrappingDuration: _minBootstrappingDuration,
            minStreamDuration: _minStreamDuration,
            feeCollector: _feeCollector,
            protocolAdmin: _protocolAdmin,
            tosVersion: _tosVersion
        });

        // Set accepted tokens
        for (uint i = 0; i < _acceptedInSupplyTokens.length; i++) {
            acceptedInSupplyTokens[_acceptedInSupplyTokens[i]] = true;
        }
        currentStreamId = 0;
    }

    modifier onlyAdmin() {
        if (msg.sender != params.protocolAdmin) revert NotAdmin();
        _;
    }

    function updateParams(
        uint256 _streamCreationFee,
        uint256 _exitFeePercent,
        uint256 _minWaitingDuration,
        uint256 _minBootstrappingDuration,
        uint256 _minStreamDuration,
        string memory _tosVersion
    ) external onlyAdmin {
        params.streamCreationFee = _streamCreationFee;
        params.exitFeePercent = _exitFeePercent;
        params.minWaitingDuration = _minWaitingDuration;
        params.minBootstrappingDuration = _minBootstrappingDuration;
        params.minStreamDuration = _minStreamDuration;
        params.tosVersion = _tosVersion;

        emit ParamsUpdated(
            address(this),
            _streamCreationFee,
            _exitFeePercent,
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

    function isAcceptedInSupplyToken(address token) public view returns (bool) {
        return acceptedInSupplyTokens[token];
    }

    function createStream(
        uint256 _streamOutAmount,
        address _outSupplyToken,
        uint256 _bootstrappingStartTime,
        uint256 _streamStartTime,
        uint256 _streamEndTime,
        uint256 _threshold,
        string memory _name,
        address _inSupplyToken,
        string memory _tosVersion,
        bytes32 _salt
    ) external payable {
        // Check if contract is accepting new streams (not frozen)
        if (frozen) revert ContractFrozen();

        // Validate input parameters
        if (_streamOutAmount == 0) revert ZeroOutSupplyNotAllowed();
        if (!acceptedInSupplyTokens[_inSupplyToken]) revert StreamInputTokenNotAccepted();

        // Validate time parameters using validateStreamTimes
        validateStreamTimes(block.timestamp, _bootstrappingStartTime, _streamStartTime, _streamEndTime);

        // Validate TOS version
        if (keccak256(abi.encodePacked(_tosVersion)) != keccak256(abi.encodePacked(params.tosVersion)))
            revert InvalidToSVersion();

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
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(Stream).creationCode,
                abi.encode(
                    _streamOutAmount,
                    _outSupplyToken,
                    _bootstrappingStartTime,
                    _streamStartTime,
                    _streamEndTime,
                    _threshold,
                    _name,
                    _inSupplyToken,
                    msg.sender
                )
            )
        );

        address predictedAddress = predictAddress(address(this), _salt, bytecodeHash);
        // Transfer out denom to stream contract
        if (!IERC20(_outSupplyToken).transferFrom(msg.sender, predictedAddress, _streamOutAmount))
            revert TokenTransferFailed();
        // Deploy new stream contract with all parameters
        Stream newStream = new Stream{ salt: _salt }(
            _streamOutAmount,
            _outSupplyToken,
            _bootstrappingStartTime,
            _streamStartTime,
            _streamEndTime,
            _threshold,
            _name,
            _inSupplyToken,
            msg.sender
        );

        if (address(newStream) != predictedAddress) revert StreamAddressPredictionFailed();
        streamAddresses[currentStreamId] = address(newStream);

        emit StreamCreated(
            _outSupplyToken,
            _inSupplyToken,
            address(this),
            _streamOutAmount,
            _bootstrappingStartTime,
            _streamStartTime,
            _streamEndTime,
            _threshold,
            _name,
            _tosVersion,
            address(newStream),
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

    function getParams() external view returns (Params memory) {
        return params;
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
