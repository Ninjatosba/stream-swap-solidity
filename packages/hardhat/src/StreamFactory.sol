// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamFactory
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Factory with multi-implementation variants and per-stream UUPS proxies
 * @dev Deploys ERC1967 proxies pointing to selected implementations (Basic/Vesting/Pool/Full).
 *      Initialization is invoked after deploying PositionStorage in the same transaction.
 */

import { IStreamFactoryEvents } from "./interfaces/IStreamFactoryEvents.sol";
import { IStreamFactoryErrors } from "./interfaces/IStreamFactoryErrors.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { IStream } from "./interfaces/IStream.sol";
import { StreamFactoryTypes } from "./types/StreamFactoryTypes.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TransferLib } from "./lib/TransferLib.sol";
import { PositionStorage } from "./storage/PositionStorage.sol";
import { DecimalMath, Decimal } from "./lib/math/DecimalMath.sol";
import { ITokenFactory } from "./interfaces/ITokenFactory.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IPoolRouter } from "./interfaces/IPoolRouter.sol";

contract StreamFactory is IStreamFactoryEvents, IStreamFactoryErrors {
    using TransferLib for address;

    enum StreamImplKind { Basic, PostActions }

    address[] public acceptedInSupplyTokens;
    uint16 public currentStreamId;
    StreamFactoryTypes.Params public params;
    mapping(uint16 => address) public streamAddresses;
    bool public frozen;
    bool public initialized;

    mapping(StreamImplKind => address) public implementations;

    modifier onlyOnce() {
        if (initialized) revert AlreadyInitialized();
        _;
        initialized = true;
    }

    modifier onlyAdmin() {
        if (msg.sender != params.protocolAdmin) revert NotAdmin();
        _;
    }

    constructor(address protocolAdmin) {
        if (protocolAdmin == address(0)) revert InvalidProtocolAdmin();
        params.protocolAdmin = protocolAdmin;
    }

    function initialize(
        StreamFactoryTypes.InitializeStreamFactoryMessage memory initializeStreamFactoryMessage
    ) external onlyAdmin onlyOnce {
        if (DecimalMath.gt(initializeStreamFactoryMessage.exitFeeRatio, DecimalMath.fromNumber(1))) {
            revert InvalidExitFeeRatio();
        }
        if (initializeStreamFactoryMessage.acceptedInSupplyTokens.length == 0) {
            revert InvalidAcceptedInSupplyTokens();
        }

        params.streamCreationFee = initializeStreamFactoryMessage.streamCreationFee;
        params.streamCreationFeeToken = initializeStreamFactoryMessage.streamCreationFeeToken;
        params.exitFeeRatio = initializeStreamFactoryMessage.exitFeeRatio;
        params.minWaitingDuration = initializeStreamFactoryMessage.minWaitingDuration;
        params.minBootstrappingDuration = initializeStreamFactoryMessage.minBootstrappingDuration;
        params.minStreamDuration = initializeStreamFactoryMessage.minStreamDuration;
        params.feeCollector = initializeStreamFactoryMessage.feeCollector;
        params.tosVersion = initializeStreamFactoryMessage.tosVersion;
        params.vestingFactoryAddress = initializeStreamFactoryMessage.vestingFactoryAddress;
        params.poolRouterAddress = initializeStreamFactoryMessage.poolRouterAddress;
        params.tokenFactoryAddress = initializeStreamFactoryMessage.tokenFactoryAddress;

        acceptedInSupplyTokens = initializeStreamFactoryMessage.acceptedInSupplyTokens;

        implementations[StreamImplKind.Basic] = initializeStreamFactoryMessage.basicImplementationAddress;
        implementations[StreamImplKind.PostActions] = initializeStreamFactoryMessage.postActionsImplementationAddress;

        emit FactoryInitialized(
            address(this),
            initializeStreamFactoryMessage.basicImplementationAddress,
            initializeStreamFactoryMessage.postActionsImplementationAddress,
            initializeStreamFactoryMessage.poolRouterAddress,
            initializeStreamFactoryMessage.feeCollector,
            initializeStreamFactoryMessage.protocolAdmin,
            initializeStreamFactoryMessage.streamCreationFeeToken,
            initializeStreamFactoryMessage.acceptedInSupplyTokens,
            initializeStreamFactoryMessage.streamCreationFee,
            initializeStreamFactoryMessage.exitFeeRatio.value,
            initializeStreamFactoryMessage.minWaitingDuration,
            initializeStreamFactoryMessage.minBootstrappingDuration,
            initializeStreamFactoryMessage.minStreamDuration,
            initializeStreamFactoryMessage.tosVersion,
            initializeStreamFactoryMessage.vestingFactoryAddress
        );
    }

    function updateAcceptedTokens(address[] calldata tokensToAdd, address[] calldata tokensToRemove) external onlyAdmin {
        for (uint256 i = 0; i < tokensToAdd.length; i++) {
            address token = tokensToAdd[i];
            if (!_isAcceptedToken(token)) {
                acceptedInSupplyTokens.push(token);
            }
        }
        for (uint256 i = 0; i < tokensToRemove.length; i++) {
            _removeAcceptedToken(tokensToRemove[i]);
        }
        emit AcceptedTokensUpdated(address(this), tokensToAdd, tokensToRemove);
    }

    function setFrozen(bool isFrozen) external onlyAdmin {
        frozen = isFrozen;
        emit FrozenStateUpdated(address(this), isFrozen);
    }

    function updateFeeCollector(address feeCollector) external onlyAdmin {
        if (feeCollector == address(0)) revert InvalidFeeCollector();
        address oldFeeCollector = params.feeCollector;
        params.feeCollector = feeCollector;
        emit FeeCollectorUpdated(address(this), oldFeeCollector, feeCollector);
    }

    function updateProtocolAdmin(address protocolAdmin) external onlyAdmin {
        if (protocolAdmin == address(0)) revert InvalidProtocolAdmin();
        address oldProtocolAdmin = params.protocolAdmin;
        params.protocolAdmin = protocolAdmin;
        emit ProtocolAdminUpdated(address(this), oldProtocolAdmin, protocolAdmin);
    }

    function updateStreamFeeParameters(uint256 streamCreationFee, address streamCreationFeeToken) external onlyAdmin {
        uint256 oldFee = params.streamCreationFee;
        address oldFeeToken = params.streamCreationFeeToken;
        params.streamCreationFee = streamCreationFee;
        params.streamCreationFeeToken = streamCreationFeeToken;
        emit StreamFeeParametersUpdated(address(this), oldFee, streamCreationFee, oldFeeToken, streamCreationFeeToken);
    }

    function updateTimingParameters(
        uint256 minWaitingDuration,
        uint256 minBootstrappingDuration,
        uint256 minStreamDuration
    ) external onlyAdmin {
        uint256 oldWaiting = params.minWaitingDuration;
        uint256 oldBootstrapping = params.minBootstrappingDuration;
        uint256 oldStream = params.minStreamDuration;
        params.minWaitingDuration = minWaitingDuration;
        params.minBootstrappingDuration = minBootstrappingDuration;
        params.minStreamDuration = minStreamDuration;
        emit TimingParametersUpdated(
            address(this), oldWaiting, minWaitingDuration, oldBootstrapping, minBootstrappingDuration, oldStream, minStreamDuration
        );
    }

    function updateImplementationParameters(
        address basicImplementation,
        address postActionsImplementation
    ) external onlyAdmin {
        address oldBasic = implementations[StreamImplKind.Basic];
        address oldPostActions = implementations[StreamImplKind.PostActions];

        implementations[StreamImplKind.Basic] = basicImplementation;
        implementations[StreamImplKind.PostActions] = postActionsImplementation;

        emit ImplementationParametersUpdated(
            address(this),
            oldBasic,
            basicImplementation,
            oldPostActions,
            postActionsImplementation
        );
    }

    function updatePoolRouterAddress(address newPoolRouter) external onlyAdmin {
        address oldRouter = params.poolRouterAddress;
        params.poolRouterAddress = newPoolRouter;
        emit PoolRouterUpdated(address(this), oldRouter, newPoolRouter);
    }

    function updateVestingFactoryAddress(address newVestingFactory) external onlyAdmin {
        address oldVestingFactory = params.vestingFactoryAddress;
        params.vestingFactoryAddress = newVestingFactory;
        emit VestingFactoryUpdated(address(this), oldVestingFactory, newVestingFactory);
    }

    function updateExitFeeRatio(Decimal memory exitFeeRatio) external onlyAdmin {
        if (DecimalMath.gt(exitFeeRatio, DecimalMath.fromNumber(1))) {
            revert InvalidExitFeeRatio();
        }
        uint256 oldRatio = params.exitFeeRatio.value;
        params.exitFeeRatio = exitFeeRatio;
        emit ExitFeeRatioUpdated(address(this), oldRatio, exitFeeRatio.value);
    }

    function updateTosVersion(string memory tosVersion) external onlyAdmin {
        string memory oldVersion = params.tosVersion;
        params.tosVersion = tosVersion;
        emit TosVersionUpdated(address(this), oldVersion, tosVersion);
    }

    function createStream(StreamTypes.CreateStreamMessage memory createStreamMessage) external payable {
        if (createStreamMessage.outSupplyToken == address(0)) revert InvalidOutSupplyToken();
        TransferLib.transferFunds(params.streamCreationFeeToken, msg.sender, params.feeCollector, params.streamCreationFee);
        uint256 totalOut = createStreamMessage.streamOutAmount + createStreamMessage.poolInfo.poolOutSupplyAmount;
        TransferLib.transferFunds(createStreamMessage.outSupplyToken, msg.sender, address(this), totalOut);
        _createStream(createStreamMessage);
    }

    function createStreamWithTokenCreation(
        StreamTypes.CreateStreamMessage memory createStreamMessage,
        StreamTypes.TokenCreationInfo memory tokenCreationInfo
    ) external payable {
        uint256 totalNeeded = createStreamMessage.streamOutAmount + createStreamMessage.poolInfo.poolOutSupplyAmount;
        if (tokenCreationInfo.totalSupply < totalNeeded) revert InvalidTokenTotalSupply();
        TransferLib.transferFunds(params.streamCreationFeeToken, msg.sender, params.feeCollector, params.streamCreationFee);

        uint256 creatorBalance = tokenCreationInfo.totalSupply - totalNeeded;
        address[] memory holders = new address[](2);
        uint256[] memory balances = new uint256[](2);
        holders[0] = createStreamMessage.creator;
        balances[0] = creatorBalance;
        holders[1] = address(this);
        balances[1] = totalNeeded;

        address tokenAddress = ITokenFactory(params.tokenFactoryAddress).createToken(tokenCreationInfo, holders, balances);
        createStreamMessage.outSupplyToken = tokenAddress;
        emit TokenCreated(tokenAddress, tokenCreationInfo.name, tokenCreationInfo.symbol, tokenCreationInfo.decimals, tokenCreationInfo.totalSupply);
        _createStream(createStreamMessage);
    }

    function _createStream(StreamTypes.CreateStreamMessage memory msg_) internal {
        if (frozen) revert ContractFrozen();
        if (msg_.streamOutAmount == 0) revert ZeroOutSupplyNotAllowed();
        if (msg_.creator == address(0)) revert InvalidCreator();
        if (!_isAcceptedToken(msg_.inSupplyToken)) revert StreamInputTokenNotAccepted();
        if (msg_.inSupplyToken == msg_.outSupplyToken) revert SameInputAndOutputToken();
        if (keccak256(abi.encodePacked(msg_.tosVersion)) != keccak256(abi.encodePacked(params.tosVersion))) {
            revert InvalidToSVersion();
        }
        if (msg_.poolInfo.poolOutSupplyAmount > 0) {
            if (params.poolRouterAddress == address(0)) revert PoolRouterNotSet();
            IPoolRouter(params.poolRouterAddress).validatePoolParams(msg_.poolInfo);
        }

        if (msg_.creatorVesting.isVestingEnabled || msg_.beneficiaryVesting.isVestingEnabled) {
            if (params.vestingFactoryAddress == address(0)) revert VestingFactoryNotSet();
            _validateVestingParams(msg_.creatorVesting);
            _validateVestingParams(msg_.beneficiaryVesting);
        }

        _validateStreamTimes(block.timestamp, msg_.bootstrappingStartTime, msg_.streamStartTime, msg_.streamEndTime);

        StreamImplKind kind = _determineKind(msg_);
        address impl = implementations[kind];
        if (impl == address(0)) revert ImplementationNotSet(uint8(kind));

        ERC1967Proxy proxy = new ERC1967Proxy(impl, "");
        address streamAddr = address(proxy);

        PositionStorage positionStorage = new PositionStorage(streamAddr);
        IStream(streamAddr).initialize(msg_, address(positionStorage));

        uint256 totalOut = msg_.streamOutAmount + msg_.poolInfo.poolOutSupplyAmount;
        TransferLib.transferFunds(msg_.outSupplyToken, address(this), streamAddr, totalOut);

        uint16 streamId = currentStreamId;
        currentStreamId++;
        streamAddresses[streamId] = streamAddr;

        emit StreamCreated(
            address(this),
            msg_.outSupplyToken,
            msg_.inSupplyToken,
            streamAddr,
            msg_.creator,
            address(positionStorage),
            msg_.streamOutAmount,
            msg_.poolInfo.poolOutSupplyAmount,
            msg_.poolInfo.dexType == StreamTypes.DexType.V2 ? "V2" : (msg_.poolInfo.dexType == StreamTypes.DexType.V3 ? "V3" : "AERO"),
            msg_.creatorVesting.isVestingEnabled,
            msg_.beneficiaryVesting.isVestingEnabled,
            msg_.creatorVesting.vestingDuration,
            msg_.beneficiaryVesting.vestingDuration,
            msg_.bootstrappingStartTime,
            msg_.streamStartTime,
            msg_.streamEndTime,
            msg_.threshold,
            msg_.metadata.ipfsHash,
            params.tosVersion,
            streamId
        );
    }

    function _determineKind(StreamTypes.CreateStreamMessage memory msg_) internal pure returns (StreamImplKind) {
        bool hasVesting = msg_.creatorVesting.isVestingEnabled || msg_.beneficiaryVesting.isVestingEnabled;
        bool hasPool = msg_.poolInfo.poolOutSupplyAmount > 0;
        if (hasVesting || hasPool) return StreamImplKind.PostActions;
        return StreamImplKind.Basic;
    }

    // ============ View ============
    function getStreams() external view returns (address[] memory) {
        address[] memory streams = new address[](currentStreamId);
        for (uint16 i = 0; i < currentStreamId; i++) {
            streams[i] = streamAddresses[i];
        }
        return streams;
    }

    function getStream(uint16 streamId) external view returns (address) {
        return streamAddresses[streamId];
    }

    function isStream(address streamAddress) external view returns (bool) {
        for (uint16 i = 0; i < currentStreamId; i++) {
            if (streamAddresses[i] == streamAddress) return true;
        }
        return false;
    }

    function getParams() external view returns (StreamFactoryTypes.Params memory) {
        return params;
    }

    function getImplementation(StreamImplKind kind) external view returns (address) {
        return implementations[kind];
    }

    function isAcceptedInSupplyToken(address token) external view returns (bool) {
        return _isAcceptedToken(token);
    }

    function getAcceptedInSupplyTokens() external view returns (address[] memory) {
        return acceptedInSupplyTokens;
    }

    // ============ Internal Helpers ============
    function _isAcceptedToken(address token) internal view returns (bool) {
        for (uint256 i = 0; i < acceptedInSupplyTokens.length; i++) {
            if (acceptedInSupplyTokens[i] == token) {
                return true;
            }
        }
        return false;
    }

    function _removeAcceptedToken(address token) internal {
        for (uint256 i = 0; i < acceptedInSupplyTokens.length; i++) {
            if (acceptedInSupplyTokens[i] == token) {
                acceptedInSupplyTokens[i] = acceptedInSupplyTokens[acceptedInSupplyTokens.length - 1];
                acceptedInSupplyTokens.pop();
                return;
            }
        }
    }

    function _validateStreamTimes(
        uint256 nowTime,
        uint256 bootstrappingStartTime,
        uint256 startTime,
        uint256 endTime
    ) internal view {
        if (nowTime > bootstrappingStartTime) revert InvalidBootstrappingStartTime();
        if (bootstrappingStartTime > startTime) revert InvalidStreamStartTime();
        if (startTime > endTime) revert InvalidStreamEndTime();
        if (endTime - startTime < params.minStreamDuration) revert StreamDurationTooShort();
        if (startTime - bootstrappingStartTime < params.minBootstrappingDuration) revert BootstrappingDurationTooShort();
        if (bootstrappingStartTime - nowTime < params.minWaitingDuration) revert WaitingDurationTooShort();
    }

    function _validateVestingParams(StreamTypes.VestingInfo memory vesting) internal pure {
        if (vesting.isVestingEnabled && vesting.vestingDuration == 0) {
            revert InvalidVestingDuration();
        }
    }
}


