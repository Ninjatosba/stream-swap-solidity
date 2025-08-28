// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamFactory
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Central factory managing StreamSwap protocol operations and stream creation
 * @dev The StreamFactory serves as the protocol's control center, handling stream creation,
 *      parameter management, and protocol governance. It uses minimal proxy clones for
 *      gas-efficient stream deployment and maintains protocol-wide configurations.
 *      
 *      Core Responsibilities:
 *      - Stream Creation: Deploy new streams with validation and fee collection
 *      - Protocol Parameters: Manage fees, durations, and accepted tokens
 *      - Access Control: Admin functions for protocol governance
 *      - Emergency Powers: Freeze stream creation and cancel active streams
 *      - Integration Management: Deploy and coordinate with VestingFactory
 */
import { IStreamEvents } from "./interfaces/IStreamEvents.sol";
import { IStreamFactoryErrors } from "./interfaces/IStreamFactoryErrors.sol";
import { VestingFactory } from "./VestingFactory.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { IStream } from "./interfaces/IStream.sol";
import { StreamFactoryTypes } from "./types/StreamFactoryTypes.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TransferLib } from "./lib/TransferLib.sol";
import { PositionStorage } from "./storage/PositionStorage.sol";
import { DecimalMath, Decimal } from "./lib/math/DecimalMath.sol";

/**
 * @title StreamFactory
 * @dev Factory contract for creating and managing token streams
 * @notice Handles stream creation, parameter management, and accepted token management
 */
contract StreamFactory is IStreamEvents, IStreamFactoryErrors {
    using TransferLib for address;

    // ============ State Variables ============

    /// @notice Mapping of accepted input supply tokens
    mapping(address => bool) public acceptedInSupplyTokens;

    /// @notice Current stream ID counter
    uint16 public currentStreamId;

    /// @notice Factory parameters
    StreamFactoryTypes.Params public params;

    /// @notice Mapping of stream ID to stream address
    mapping(uint16 => address) public streamAddresses;

    /// @notice Flag to freeze stream creation
    bool public frozen;

    /// @notice Flag to ensure initialization happens only once
    bool public initialized;

    // ============ Modifiers ============

    /**
     * @dev Ensures the function can only be called once during initialization
     */
    modifier onlyOnce() {
        if (initialized) revert AlreadyInitialized();
        _;
        initialized = true;
    }

    /**
     * @dev Ensures only the protocol admin can call the function
     */
    modifier onlyAdmin() {
        if (msg.sender != params.protocolAdmin) revert NotAdmin();
        _;
    }

    // ============ Constructor ============

    /**
     * @dev Constructor to set the protocol admin
     * @param protocolAdmin Address of the protocol admin
     */
    constructor(address protocolAdmin) {
        if (protocolAdmin == address(0)) revert InvalidProtocolAdmin();
        params.protocolAdmin = protocolAdmin;
    }

    // ============ Initialization ============

    /**
     * @dev Initializes the factory with the provided configuration
     * @param initializeStreamMessage Factory initialization parameters
     * @notice This function can only be called once by the admin
     */
    function initialize(
        StreamFactoryTypes.InitializeStreamMessage memory initializeStreamMessage
    ) external onlyAdmin onlyOnce {
        if (DecimalMath.gt(initializeStreamMessage.exitFeeRatio, DecimalMath.fromNumber(1)))
            revert InvalidExitFeeRatio();

        if (initializeStreamMessage.acceptedInSupplyTokens.length == 0) revert InvalidAcceptedInSupplyTokens();

        // Allow zero address for native token support
        // if (initializeStreamMessage.streamCreationFeeToken == address(0)) revert InvalidStreamCreationFeeToken();

        if (initializeStreamMessage.streamImplementationAddress == address(0))
            revert InvalidStreamImplementationAddress();

        if (initializeStreamMessage.poolWrapperAddress == address(0)) revert InvalidPoolWrapper();

        // Deploy vesting factory
        VestingFactory vestingFactory = new VestingFactory();
        emit VestingContractDeployed(address(this), address(vestingFactory));

        // Set factory parameters
        params.streamCreationFee = initializeStreamMessage.streamCreationFee;
        params.streamCreationFeeToken = initializeStreamMessage.streamCreationFeeToken;
        params.exitFeeRatio = initializeStreamMessage.exitFeeRatio;
        params.minWaitingDuration = initializeStreamMessage.minWaitingDuration;
        params.minBootstrappingDuration = initializeStreamMessage.minBootstrappingDuration;
        params.minStreamDuration = initializeStreamMessage.minStreamDuration;
        params.feeCollector = initializeStreamMessage.feeCollector;
        params.tosVersion = initializeStreamMessage.tosVersion;
        params.vestingFactoryAddress = address(vestingFactory);
        params.poolWrapperAddress = initializeStreamMessage.poolWrapperAddress;
        params.streamImplementationAddress = initializeStreamMessage.streamImplementationAddress;

        // Set accepted tokens (including zero address for native token)
        for (uint256 i = 0; i < initializeStreamMessage.acceptedInSupplyTokens.length; i++) {
            // Allow zero address for native token support
            // if (initializeStreamMessage.acceptedInSupplyTokens[i] == address(0)) revert InvalidAcceptedInSupplyTokens();
            acceptedInSupplyTokens[initializeStreamMessage.acceptedInSupplyTokens[i]] = true;
        }

        emit FactoryInitialized(
            address(this),
            initializeStreamMessage.streamImplementationAddress,
            initializeStreamMessage.poolWrapperAddress,
            initializeStreamMessage.feeCollector,
            initializeStreamMessage.protocolAdmin,
            initializeStreamMessage.streamCreationFeeToken,
            initializeStreamMessage.acceptedInSupplyTokens,
            initializeStreamMessage.streamCreationFee,
            initializeStreamMessage.exitFeeRatio.value,
            initializeStreamMessage.minWaitingDuration,
            initializeStreamMessage.minBootstrappingDuration,
            initializeStreamMessage.minStreamDuration,
            initializeStreamMessage.tosVersion,
            address(vestingFactory)
        );
    }

    // ============ Stream Creation ============

    /**
     * @dev Creates a new stream with the provided configuration
     * @param createStreamMessage Stream creation parameters
     * @notice Anyone can create a stream if they provide the required tokens and fees
     */
    function createStream(StreamTypes.CreateStreamMessage memory createStreamMessage) external payable {
        // Check if contract is accepting new streams (not frozen)
        if (frozen) revert ContractFrozen();

        // Validate input parameters
        if (createStreamMessage.streamOutAmount == 0) revert ZeroOutSupplyNotAllowed();
        if (createStreamMessage.outSupplyToken == address(0)) revert InvalidOutSupplyToken();
        if (createStreamMessage.creator == address(0)) revert InvalidCreator();
        if (!acceptedInSupplyTokens[createStreamMessage.inSupplyToken]) revert StreamInputTokenNotAccepted();
        if (createStreamMessage.inSupplyToken == createStreamMessage.outSupplyToken) revert SameInputAndOutputToken();
    

        // Validate vesting configurations
        validateVesting(createStreamMessage.creatorVesting);
        validateVesting(createStreamMessage.beneficiaryVesting);

        // Validate time parameters
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

        // Handle creation fee (can be native or ERC20) BEFORE any cloning/deployment
        // Pull the fee into the factory. msg.value must be handled by callee via checks.
        TransferLib.pullFunds(
            params.streamCreationFeeToken,
            msg.sender,
            params.streamCreationFee
        );
        TransferLib.pushFunds(
            params.streamCreationFeeToken,
            params.feeCollector,
            params.streamCreationFee
        );

        // Clone stream contract
        address clone = Clones.clone(params.streamImplementationAddress);
        IStream stream = IStream(clone);

        // Deploy PositionStorage
        PositionStorage positionStorage = new PositionStorage(address(stream));

        uint16 streamId = currentStreamId;
        currentStreamId++;
        streamAddresses[streamId] = address(stream);

        // Transfer output tokens to stream (output tokens cannot be native)
        uint256 totalOut = createStreamMessage.streamOutAmount + createStreamMessage.poolInfo.poolOutSupplyAmount;
        TransferLib.pullFunds(createStreamMessage.outSupplyToken, msg.sender, totalOut);
        TransferLib.pushFunds(createStreamMessage.outSupplyToken, address(stream), totalOut);

        // Initialize the cloned stream
        stream.initialize(createStreamMessage, address(positionStorage));

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
            streamId
        );
    }

    // ============ Parameter Management ============

    /**
     * @dev Updates the stream creation fee
     * @param streamCreationFee New creation fee amount
     */
    function updateStreamCreationFee(uint256 streamCreationFee) external onlyAdmin {
        params.streamCreationFee = streamCreationFee;
        emit ParamsUpdated(
            address(this),
            streamCreationFee,
            params.exitFeeRatio.value,
            params.minWaitingDuration,
            params.minBootstrappingDuration,
            params.minStreamDuration,
            params.tosVersion
        );
    }

    /**
     * @dev Updates the stream creation fee token
     * @param streamCreationFeeToken New fee token address
     */
    function updateStreamCreationFeeToken(address streamCreationFeeToken) external onlyAdmin {
        // Allow zero address for native token support
        // if (streamCreationFeeToken == address(0)) revert InvalidStreamCreationFeeToken();
        params.streamCreationFeeToken = streamCreationFeeToken;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            params.exitFeeRatio.value,
            params.minWaitingDuration,
            params.minBootstrappingDuration,
            params.minStreamDuration,
            params.tosVersion
        );
    }

    /**
     * @dev Updates the exit fee ratio
     * @param exitFeeRatio New exit fee ratio
     */
    function updateExitFeeRatio(Decimal memory exitFeeRatio) external onlyAdmin {
        if (DecimalMath.gt(exitFeeRatio, DecimalMath.fromNumber(1))) revert InvalidExitFeeRatio();
        params.exitFeeRatio = exitFeeRatio;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            exitFeeRatio.value,
            params.minWaitingDuration,
            params.minBootstrappingDuration,
            params.minStreamDuration,
            params.tosVersion
        );
    }

    /**
     * @dev Updates the minimum waiting duration
     * @param minWaitingDuration New minimum waiting duration
     */
    function updateMinWaitingDuration(uint256 minWaitingDuration) external onlyAdmin {
        params.minWaitingDuration = minWaitingDuration;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            params.exitFeeRatio.value,
            minWaitingDuration,
            params.minBootstrappingDuration,
            params.minStreamDuration,
            params.tosVersion
        );
    }

    /**
     * @dev Updates the minimum bootstrapping duration
     * @param minBootstrappingDuration New minimum bootstrapping duration
     */
    function updateMinBootstrappingDuration(uint256 minBootstrappingDuration) external onlyAdmin {
        params.minBootstrappingDuration = minBootstrappingDuration;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            params.exitFeeRatio.value,
            params.minWaitingDuration,
            minBootstrappingDuration,
            params.minStreamDuration,
            params.tosVersion
        );
    }

    /**
     * @dev Updates the minimum stream duration
     * @param minStreamDuration New minimum stream duration
     */
    function updateMinStreamDuration(uint256 minStreamDuration) external onlyAdmin {
        params.minStreamDuration = minStreamDuration;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            params.exitFeeRatio.value,
            params.minWaitingDuration,
            params.minBootstrappingDuration,
            minStreamDuration,
            params.tosVersion
        );
    }

    /**
     * @dev Updates the TOS version
     * @param tosVersion New TOS version
     */
    function updateTosVersion(string memory tosVersion) external onlyAdmin {
        params.tosVersion = tosVersion;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            params.exitFeeRatio.value,
            params.minWaitingDuration,
            params.minBootstrappingDuration,
            params.minStreamDuration,
            tosVersion
        );
    }

    /**
     * @dev Updates the fee collector address
     * @param feeCollector New fee collector address
     */
    function updateFeeCollector(address feeCollector) external onlyAdmin {
        if (feeCollector == address(0)) revert InvalidFeeCollector();
        params.feeCollector = feeCollector;
        emit FeeCollectorUpdated(address(this), feeCollector);
    }

    /**
     * @dev Updates the protocol admin address
     * @param protocolAdmin New protocol admin address
     */
    function updateProtocolAdmin(address protocolAdmin) external onlyAdmin {
        if (protocolAdmin == address(0)) revert InvalidProtocolAdmin();
        params.protocolAdmin = protocolAdmin;
        emit ProtocolAdminUpdated(address(this), protocolAdmin);
    }

    /**
     * @dev Updates the pool wrapper address
     * @param poolWrapper New pool wrapper address
     */
    function updatePoolWrapper(address poolWrapper) external onlyAdmin {
        if (poolWrapper == address(0)) revert InvalidPoolWrapper();
        params.poolWrapperAddress = poolWrapper;
        emit PoolWrapperUpdated(address(this), poolWrapper);
    }

    /**
     * @dev Updates the stream implementation address
     * @param implementation New stream implementation address
     */
    function updateStreamImplementation(address implementation) external onlyAdmin {
        if (implementation == address(0)) revert InvalidImplementationAddress();
        params.streamImplementationAddress = implementation;
        emit ParamsUpdated(
            address(this),
            params.streamCreationFee,
            params.exitFeeRatio.value,
            params.minWaitingDuration,
            params.minBootstrappingDuration,
            params.minStreamDuration,
            params.tosVersion
        );
    }

    // ============ Token Management ============

    /**
     * @dev Updates the list of accepted input supply tokens
     * @param tokensToAdd Array of token addresses to add
     * @param tokensToRemove Array of token addresses to remove
     */
    function updateAcceptedTokens(
        address[] calldata tokensToAdd,
        address[] calldata tokensToRemove
    ) external onlyAdmin {
        for (uint256 i = 0; i < tokensToAdd.length; i++) {
            acceptedInSupplyTokens[tokensToAdd[i]] = true;
        }
        for (uint256 i = 0; i < tokensToRemove.length; i++) {
            acceptedInSupplyTokens[tokensToRemove[i]] = false;
        }
        emit AcceptedTokensUpdated(address(this), tokensToAdd, tokensToRemove);
    }

    // ============ Factory Management ============

    /**
     * @dev Sets the frozen state of the factory
     * @param isFrozen Whether the factory should be frozen
     */
    function setFrozen(bool isFrozen) external onlyAdmin {
        frozen = isFrozen;
        emit FrozenStateUpdated(address(this), isFrozen);
    }

    // ============ View Functions ============

    /**
     * @dev Get all stream addresses
     * @return Array of stream addresses
     */
    function getStreams() external view returns (address[] memory) {
        address[] memory streams = new address[](currentStreamId);
        for (uint16 i = 0; i < currentStreamId; i++) {
            streams[i] = streamAddresses[i];
        }
        return streams;
    }

    /**
     * @dev Get stream address by ID
     * @param streamId Stream ID
     * @return Stream address
     */
    function getStream(uint16 streamId) external view returns (address) {
        return streamAddresses[streamId];
    }

    /**
     * @dev Check if an address is a stream created by this factory
     * @param streamAddress Address to check
     * @return True if the address is a stream
     */
    function isStream(address streamAddress) external view returns (bool) {
        for (uint16 i = 0; i < currentStreamId; i++) {
            if (streamAddresses[i] == streamAddress) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get factory parameters
     * @return Factory parameters
     */
    function getParams() external view returns (StreamFactoryTypes.Params memory) {
        return params;
    }

    /**
     * @dev Check if a token is accepted as input supply token
     * @param token Token address to check
     * @return True if the token is accepted
     */
    function isAcceptedInSupplyToken(address token) public view returns (bool) {
        return acceptedInSupplyTokens[token];
    }

    /**
     * @dev Get all accepted input supply tokens
     * @return Array of accepted token addresses
     */
    function getAcceptedInSupplyTokens() external view returns (address[] memory) {
        address[] memory tokens = new address[](currentStreamId);
        for (uint16 i = 0; i < currentStreamId; i++) {
            if (acceptedInSupplyTokens[streamAddresses[i]]) {
                tokens[i] = streamAddresses[i];
            }
        }
        return tokens;
    }

    // ============ Internal Functions ============

    /**
     * @dev Validates stream timing parameters
     * @param nowTime Current timestamp
     * @param bootstrappingStartTime Bootstrapping start time
     * @param startTime Stream start time
     * @param endTime Stream end time
     */
    function validateStreamTimes(
        uint256 nowTime,
        uint256 bootstrappingStartTime,
        uint256 startTime,
        uint256 endTime
    ) internal view {
        if (nowTime > bootstrappingStartTime) revert InvalidBootstrappingStartTime();
        if (bootstrappingStartTime > startTime) revert InvalidStreamStartTime();
        if (startTime > endTime) revert InvalidStreamEndTime();
        if (endTime - startTime < params.minStreamDuration) revert StreamDurationTooShort();
        if (startTime - bootstrappingStartTime < params.minBootstrappingDuration)
            revert BootstrappingDurationTooShort();
        if (bootstrappingStartTime - nowTime < params.minWaitingDuration) revert WaitingDurationTooShort();
    }

    /**
     * @dev Validates vesting configurations
     * @param vesting Vesting configuration to validate
     */
    function validateVesting(StreamTypes.VestingInfo memory vesting) internal pure {
        if (vesting.isVestingEnabled && vesting.vestingDuration == 0) {
            revert InvalidVestingDuration();
        }
    }
}
