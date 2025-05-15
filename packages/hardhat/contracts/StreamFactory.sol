// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;
import "./interfaces/IStreamEvents.sol";
import "./interfaces/IStreamFactoryErrors.sol";
import "./Vesting.sol";
import "./types/StreamTypes.sol";
import "./interfaces/IStream.sol";
import "hardhat/console.sol";
import "./types/StreamFactoryTypes.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./storage/PositionStorage.sol";

contract StreamFactory is IStreamEvents, IStreamFactoryErrors {
    mapping(address => bool) public acceptedInSupplyTokens;

    address public constant NATIVE_TOKEN = address(0);

    uint16 public currentStreamId;

    StreamFactoryTypes.Params public params;
    mapping(uint16 => address) public streamAddresses;

    bool public frozen;
    bool public initialized;

    constructor(address _protocolAdmin) {
        if (_protocolAdmin == address(0)) revert InvalidProtocolAdmin();
        params.protocolAdmin = _protocolAdmin;
    }

    // Only once
    modifier onlyOnce() {
        require(!initialized, "Already initialized");
        _;
        initialized = true;
    }

    function initialize(
        StreamFactoryTypes.initializeStreamMessage memory initializeStreamMessage
    ) external onlyAdmin onlyOnce {
        if (DecimalMath.gt(initializeStreamMessage.exitFeeRatio, DecimalMath.fromNumber(1)))
            revert InvalidExitFeeRatio();

        // Deploy vesting contract
        Vesting vesting = new Vesting();
        emit VestingContractDeployed(address(this), address(vesting));

        params.streamCreationFee = initializeStreamMessage.streamCreationFee;
        params.streamCreationFeeToken = initializeStreamMessage.streamCreationFeeToken;
        params.exitFeeRatio = initializeStreamMessage.exitFeeRatio;
        params.minWaitingDuration = initializeStreamMessage.minWaitingDuration;
        params.minBootstrappingDuration = initializeStreamMessage.minBootstrappingDuration;
        params.minStreamDuration = initializeStreamMessage.minStreamDuration;
        params.feeCollector = initializeStreamMessage.feeCollector;
        params.tosVersion = initializeStreamMessage.tosVersion;
        params.vestingAddress = address(vesting);
        params.poolWrapperAddress = initializeStreamMessage.poolWrapperAddress;
        params.streamImplementationAddress = initializeStreamMessage.streamImplementationAddress;
        // Set accepted tokens
        for (uint i = 0; i < initializeStreamMessage.acceptedInSupplyTokens.length; i++) {
            acceptedInSupplyTokens[initializeStreamMessage.acceptedInSupplyTokens[i]] = true;
        }
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

    function updatePoolWrapper(address _poolWrapper) external onlyAdmin {
        if (_poolWrapper == address(0)) revert InvalidPoolWrapper();
        params.poolWrapperAddress = _poolWrapper;
        emit PoolWrapperUpdated(address(this), _poolWrapper);
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

        // Clone stream contract
        address clone = Clones.clone(params.streamImplementationAddress);
        IStream stream = IStream(clone);

        // Deploy PositionStorage
        PositionStorage positionStorage = new PositionStorage(address(stream));

        // Transfer tokens before initialization
        if (
            !IERC20(createStreamMessage.outSupplyToken).transferFrom(
                msg.sender,
                address(stream),
                createStreamMessage.streamOutAmount + createStreamMessage.poolInfo.poolOutSupplyAmount
            )
        ) revert TokenTransferFailed();

        // Initialize the cloned stream
        stream.initialize(createStreamMessage, address(positionStorage));

        // Store stream address
        streamAddresses[currentStreamId] = address(stream);

        emit StreamCreated(
            address(this),
            createStreamMessage.outSupplyToken,
            createStreamMessage.inSupplyToken,
            address(stream),
            address(positionStorage),
            createStreamMessage.streamOutAmount,
            createStreamMessage.bootstrappingStartTime,
            createStreamMessage.streamStartTime,
            createStreamMessage.streamEndTime,
            createStreamMessage.threshold,
            createStreamMessage.metadata.ipfsHash,
            params.tosVersion,
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

    function setImplementation(address _implementation) external onlyAdmin {
        if (_implementation == address(0)) revert InvalidImplementationAddress();

        params.streamImplementationAddress = _implementation;
    }

    function setStreamCreationFee(uint256 _fee) external onlyAdmin {
        params.streamCreationFee = _fee;
    }

    function setStreamCreationFeeToken(address _token) external onlyAdmin {
        params.streamCreationFeeToken = _token;
    }

    function setExitFeeRatio(Decimal memory _ratio) external onlyAdmin {
        if (DecimalMath.gt(_ratio, DecimalMath.fromNumber(1))) revert InvalidExitFeeRatio();
        params.exitFeeRatio = _ratio;
    }
}
