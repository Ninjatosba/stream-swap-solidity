// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamCore
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Abstract base contract for streaming functionality with extension hooks
 * @dev This contract contains the core streaming logic with virtual hook functions
 *      that can be overridden by implementation contracts to add features like
 *      vesting, pool creation, etc. All storage is defined here to ensure
 *      consistent layout across implementations for upgradeability.
 */

import { PositionTypes } from "./types/PositionTypes.sol";
import { IPositionStorage } from "./interfaces/IPositionStorage.sol";
import { IStreamEvents } from "./interfaces/IStreamEvents.sol";
import { IStreamErrors } from "./interfaces/IStreamErrors.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { StreamFactoryTypes } from "./types/StreamFactoryTypes.sol";
import { IStreamFactoryParams } from "./interfaces/IStreamFactoryParams.sol";
import { DecimalMath, Decimal } from "./lib/math/DecimalMath.sol";
import { StreamMathLib } from "./lib/math/StreamMathLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TransferLib } from "./lib/TransferLib.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IPermit2 } from "./interfaces/IPermit2.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "hardhat/console.sol";

abstract contract StreamCore is IStreamErrors, IStreamEvents, UUPSUpgradeable {
    // ============ State Variables ============
    // All storage must be defined here for upgrade compatibility
    
    /// @notice Address of the stream creator
    address public creator;

    /// @notice Address of the stream factory that deployed this stream
    /// @dev Changed from immutable to storage for proxy compatibility
    address public STREAM_FACTORY_ADDRESS;

    /// @notice Address of the position storage contract
    address public positionStorageAddress;

    /// @notice Flag to ensure initialization happens only once
    bool private initialized;

    /// @notice Current state of the stream (distribution index, remaining tokens, etc.)
    StreamTypes.StreamState public streamState;

    /// @notice Token addresses for input and output tokens
    StreamTypes.StreamTokens public streamTokens;

    /// @notice Metadata associated with the stream
    StreamTypes.StreamMetadata public streamMetadata;

    /// @notice Current status of the stream (Waiting, Bootstrapping, Active, etc.)
    StreamTypes.Status public streamStatus;

    /// @notice Timing information for the stream phases
    StreamTypes.StreamTimes public streamTimes;
    
    /// @notice Optional Merkle whitelist root; zero means no whitelist (public stream)
    bytes32 public whitelistRoot;

    /// @notice Snapshot of factory parameters at stream creation time
    /// @dev This ensures factory parameter updates don't affect ongoing streams
    StreamFactoryTypes.Params public factoryParamsSnapshot;

    /// @notice Address of the Permit2 contract
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Storage gap for future upgrades
    uint256[39] private __gap;

    // ============ Modifiers ============

    /**
     * @dev Ensures the function can only be called once during initialization
     */
    modifier onlyOnce() {
        if (initialized) revert Unauthorized();
        _;
        initialized = true;
    }

    /**
     * @dev Ensures only the stream factory can call the function
     */
    modifier onlyStreamFactory() {
        if (msg.sender != STREAM_FACTORY_ADDRESS) revert Unauthorized();
        _;
    }

    /**
     * @dev Ensures only the stream creator can call the function
     */
    modifier onlyCreator() {
        if (msg.sender != creator) revert Unauthorized();
        _;
    }

    /**
     * @dev Ensures only the protocol admin can call the function
     */
    modifier onlyProtocolAdmin() {
        if (msg.sender != factoryParamsSnapshot.protocolAdmin) revert Unauthorized();
        _;
    }

    // ============ Initialization ============

    /**
     * @dev Initializes the stream with the provided configuration
     * @param createStreamMessage Stream creation parameters
     * @param storageAddress Address of the position storage contract
     * @notice This function can only be called once and must be invoked by the factory
     */
    function initialize(
        StreamTypes.CreateStreamMessage memory createStreamMessage,
        address storageAddress,
        uint8 inTokenDecimals,
        uint8 outTokenDecimals
    ) external virtual onlyOnce {
        if (storageAddress == address(0)) revert InvalidPositionStorageAddress();
        
        // Set factory address from caller
        STREAM_FACTORY_ADDRESS = msg.sender;
        
        // Save position storage address
        positionStorageAddress = storageAddress;
        
        // Get and store factory parameters snapshot from the factory
        IStreamFactoryParams factoryContract = IStreamFactoryParams(STREAM_FACTORY_ADDRESS);
        factoryParamsSnapshot = factoryContract.getParams();
        
        // Set creator
        creator = createStreamMessage.creator;
        
        // Initialize stream state
        streamState = StreamTypes.StreamState({
            distIndex: DecimalMath.fromNumber(0),
            outRemaining: createStreamMessage.streamOutAmount,
            inSupply: 0,
            spentIn: 0,
            shares: 0,
            currentStreamedPrice: DecimalMath.fromNumber(0),
            threshold: createStreamMessage.threshold,
            outSupply: createStreamMessage.streamOutAmount,
            lastUpdated: block.timestamp
        });
        
        // Initialize stream tokens
        streamTokens = StreamTypes.StreamTokens({
            inToken: StreamTypes.Token({
                tokenAddress: createStreamMessage.inSupplyToken,
                decimals: inTokenDecimals
            }),
            outToken: StreamTypes.Token({
                tokenAddress: createStreamMessage.outSupplyToken,
                decimals: outTokenDecimals
            })
        });
        
        // Initialize stream metadata
        streamMetadata = createStreamMessage.metadata;
        
        // Initialize stream status
        streamStatus = StreamTypes.Status.Waiting;
        
        // Initialize stream times
        streamTimes = StreamTypes.StreamTimes({
            bootstrappingStartTime: createStreamMessage.bootstrappingStartTime,
            streamStartTime: createStreamMessage.streamStartTime,
            streamEndTime: createStreamMessage.streamEndTime
        });
        
        // Initialize whitelist root
        whitelistRoot = createStreamMessage.whitelistRoot;
        
        // Call initialization hook for extensions
        _onInitialize(createStreamMessage);
    }

    // ============ Extension Hooks (Virtual Functions) ============

    /**
     * @dev Hook called during initialization for extensions to set up their state
     * @param createStreamMessage Stream creation parameters
     */
    function _onInitialize(StreamTypes.CreateStreamMessage memory createStreamMessage) internal virtual {}

    /**
     * @dev Hook called after a subscription
     * @param user Address of the subscriber
     * @param amountIn Amount subscribed
     */
    function _onSubscribe(address user, uint256 amountIn) internal virtual {}

    /**
     * @dev Hook called after a withdrawal
     * @param user Address of the withdrawer
     * @param amountOut Amount withdrawn
     */
    function _onWithdraw(address user, uint256 amountOut) internal virtual {}

    /**
     * @dev Hook called when a user exits successfully (threshold met)
     * @param user Address of the exiting user
     * @param purchased Amount of output tokens purchased
     * @param inRefunded Amount of input tokens refunded
     */
    function _onExitSuccess(address user, uint256 purchased, uint256 inRefunded) internal virtual {
        TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), user, purchased);
        
        if (inRefunded > 0) {
            TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), user, inRefunded);
        }
    }

    /**
     * @dev Hook called when a user exits with refund (threshold not met or cancelled)
     * @param user Address of the exiting user
     * @param totalRefund Amount of input tokens to refund
     */
    function _onExitRefund(address user, uint256 totalRefund) internal virtual {
        TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), user, totalRefund);
    }

    /**
     * @dev Hook called after finalizing a successful stream
     * @param creatorRevenue Amount of input tokens for creator
     * @param outRemaining Remaining output tokens
     */
    function _afterFinalizeSuccess(uint256 creatorRevenue, uint256 outRemaining) internal virtual returns (uint256 adjustedCreatorRevenue) {
        TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), creator, creatorRevenue);
        
        if (outRemaining > 0) {
            TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), creator, outRemaining);
        }
        return creatorRevenue;
    }

    /**
     * @dev Hook called after finalizing a refunded stream
     * @param outSupply Amount of output tokens to return
     */
    function _afterFinalizeRefund(uint256 outSupply) internal virtual {
        TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), creator, outSupply);
    }

    // ============ Core Stream Functions ============

    /**
     * @dev Internal function containing the core subscription logic
     * @param amountIn Amount of input tokens to subscribe with
     */
    function _subscribeCore(uint256 amountIn, bytes32[] calldata merkleProof) internal {
        if (amountIn == 0) revert InvalidAmount();

        // Load and validate stream state
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Validate operation is allowed
        if (status != StreamTypes.Status.Bootstrapping && status != StreamTypes.Status.Active) {
            revert OperationNotAllowed();
        }

        // Load and sync stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        // Load position once
        PositionTypes.Position memory position = loadPosition(msg.sender);

        // If whitelist is enabled and user has no existing position, require a valid Merkle proof
        if (whitelistRoot != bytes32(0) && position.shares == 0) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            bool valid = MerkleProof.verify(merkleProof, whitelistRoot, leaf);
            if (!valid) {
                revert Unauthorized();
            }
        }

        // Calculate and collect subscription fee
        uint256 subscriptionAmount = amountIn;
        
        if (factoryParamsSnapshot.subscriptionFeeRatio.value > 0) {
            (uint256 feeAmount, uint256 remainingAmount) = StreamMathLib.calculateExitFee(amountIn, factoryParamsSnapshot.subscriptionFeeRatio);
            if (feeAmount > 0) {
                TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), factoryParamsSnapshot.feeCollector, feeAmount);
            }
            subscriptionAmount = remainingAmount;
        }

        // Sync position with latest stream state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Calculate shares before any state changes (using subscriptionAmount after fee deduction)
        uint256 newShares = StreamMathLib.computeSharesAmount(subscriptionAmount, false, state.inSupply, state.shares);

        // Update position (using subscriptionAmount after fee deduction)
        position.inBalance += subscriptionAmount;
        position.shares += newShares;

        // Update stream state (using subscriptionAmount after fee deduction)
        state.inSupply += subscriptionAmount;
        state.shares += newShares;

        // Save all states
        saveStreamStatus(status);
        savePosition(msg.sender, position);
        saveStream(state);

        emit Subscribed(
            address(this),
            msg.sender,
            position.inBalance,
            newShares,
            position.lastUpdateTime,
            position.spentIn,
            position.purchased,
            position.index.value,
            state.inSupply,
            state.shares
        );

        // Call subscription hook
        _onSubscribe(msg.sender, amountIn);
    }

    /**
     * @dev Allows users to subscribe to the stream by providing input tokens
     * @param amountIn Amount of input tokens to subscribe with
     */
    function subscribe(uint256 amountIn, bytes32[] calldata merkleProof) external {
        if (streamTokens.inToken.tokenAddress == address(0)) revert InvalidInputToken();
        // Pull funds (ERC20)
        TransferLib.transferFunds(streamTokens.inToken.tokenAddress, msg.sender, address(this), amountIn);
        _subscribeCore(amountIn, merkleProof);
    }

    /**
     * @dev Allows users to subscribe with native tokens
     * @param amountIn Amount of native tokens to subscribe with
     */
    function subscribeWithNativeToken(uint256 amountIn, bytes32[] calldata merkleProof) external payable {
        if (streamTokens.inToken.tokenAddress != address(0)) revert InvalidInputToken();
        // Pull funds (native)
        TransferLib.transferFunds(address(0), msg.sender, address(this), amountIn);
        _subscribeCore(amountIn, merkleProof);
    }

    /**
     * @dev Allows users to subscribe using Uniswap Permit2 for ERC20 approvals
     * @param amountIn Amount of input tokens to subscribe with
     * @param owner Owner of tokens and signer
     * @param permitSingle Permit2 Single permit data
     * @param signature EIP-712 signature
     */
    function subscribeWithPermit(
        uint256 amountIn,
        address owner,
        IPermit2.PermitSingle calldata permitSingle,
        bytes calldata signature,
        bytes32[] calldata merkleProof
    ) external {
        if (streamTokens.inToken.tokenAddress == address(0)) revert InvalidInputToken();
        if (permitSingle.details.token != streamTokens.inToken.tokenAddress) revert InvalidAmount();
        if (permitSingle.details.amount < uint160(amountIn)) revert InvalidAmount();
        if (permitSingle.spender != address(this)) revert InvalidAmount();
        if (permitSingle.sigDeadline < block.timestamp) revert InvalidAmount();

        IPermit2 permit2 = IPermit2(PERMIT2);
        permit2.permit(owner, permitSingle, signature);
        permit2.transferFrom(owner, address(this), uint160(amountIn), streamTokens.inToken.tokenAddress);
        _subscribeCore(amountIn, merkleProof);
    }

    /**
     * @dev Allows users to withdraw their input tokens from the stream
     * @param cap Amount of input tokens to withdraw
     */
    function withdraw(uint256 cap) external {
        // Load position once
        PositionTypes.Position memory position = loadPosition(msg.sender);

        // Validate position
        validatePosition(position, msg.sender);

        // load stream times
        StreamTypes.StreamTimes memory times = loadStreamTimes();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        if (status != StreamTypes.Status.Active && status != StreamTypes.Status.Bootstrapping) {
            revert OperationNotAllowed();
        }

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        // Sync position with the updated state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // If cap is 0, withdraw all available balance
        uint256 withdrawAmount = (cap == 0) ? position.inBalance : cap;

        // Check if withdrawal amount exceeds position balance
        if (withdrawAmount > position.inBalance) revert WithdrawAmountExceedsBalance(withdrawAmount);

        uint256 shareDeduction = 0;

        if (withdrawAmount == position.inBalance) {
            shareDeduction = position.shares;
        } else {
            shareDeduction = StreamMathLib.computeSharesAmount(withdrawAmount, true, state.inSupply, state.shares);
        }

        // Update position
        position.shares = position.shares - shareDeduction;
        position.inBalance = position.inBalance - withdrawAmount;

        // Update stream state
        state.inSupply = state.inSupply - withdrawAmount;
        state.shares = state.shares - shareDeduction;

        // Save all states first
        saveStreamStatus(status);
        savePosition(msg.sender, position);
        saveStream(state);

        // Emit events
        emit Withdrawn(
            address(this),
            msg.sender,
            position.inBalance,
            position.shares,
            position.lastUpdateTime,
            position.spentIn,
            position.purchased,
            position.index.value,
            state.inSupply,
            state.shares
        );

        // Transfer tokens
        TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), msg.sender, withdrawAmount);
        
        // Call withdrawal hook
        _onWithdraw(msg.sender, withdrawAmount);
    }

    /**
     * @dev Allows users to exit the stream and receive their tokens based on stream outcome
     */
    function exitStream() external {
        // Load and validate position
        PositionTypes.Position memory position = loadPosition(msg.sender);
        if (position.exitDate != 0) revert InvalidPosition(msg.sender, position.shares, position.exitDate, "Position has already exited");

        // Load and sync stream state
        StreamTypes.StreamState memory state = syncStream(loadStream());

        // Sync position with updated stream state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Load and sync stream status
        StreamTypes.Status status = syncStreamStatus(loadStreamStatus(), loadStreamTimes(), block.timestamp);

        // Store values for distribution before changing state
        uint256 inBalance = position.inBalance;
        uint256 purchased = position.purchased;
        uint256 spentIn = position.spentIn;
        position.exitDate = block.timestamp;

        // Save updated state before making external calls
        saveStreamStatus(status);
        saveStream(state);
        savePosition(msg.sender, position);

        // Determine outcome
        bool thresholdReached = (state.spentIn >= state.threshold);
        bool isSuccess = (status == StreamTypes.Status.FinalizedStreamed ||
            (status == StreamTypes.Status.Ended && thresholdReached));
        bool isRefund = (status == StreamTypes.Status.FinalizedRefunded ||
            status == StreamTypes.Status.Cancelled ||
            (status == StreamTypes.Status.Ended && !thresholdReached));

        if (isSuccess) {
            // Case 1: Successful exit - use hook for distribution
            emit ExitStreamed(address(this), msg.sender, purchased, spentIn, position.index.value, inBalance, block.timestamp);
            _onExitSuccess(msg.sender, purchased, inBalance);
        } else if (isRefund) {
            // Case 2: Refund exit - use hook for refund
            uint256 totalRefund = inBalance + spentIn;
            position.purchased = 0;
            position.spentIn = 0;
            position.inBalance = totalRefund;
            savePosition(msg.sender, position);
            emit ExitRefunded(address(this), msg.sender, position.inBalance, position.spentIn, block.timestamp);
            _onExitRefund(msg.sender, totalRefund);
        } else {
            // Case 3: No exit allowed
            revert OperationNotAllowed();
        }
    }

    /**
     * @dev Allows the creator to finalize the stream after it has ended
     */
    function finalizeStream() external onlyCreator {
        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        if (status != StreamTypes.Status.Ended) {
            revert OperationNotAllowed();
        }

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        bool thresholdReached = state.spentIn >= state.threshold;

        // Store values needed for distribution before state changes
        uint256 outRemaining = state.outRemaining;
        uint256 outSupply = state.outSupply;
        uint256 spentIn = state.spentIn;

        if (thresholdReached) {
            address feeCollector = factoryParamsSnapshot.feeCollector;
            Decimal memory exitFeeRatio = factoryParamsSnapshot.exitFeeRatio;
            // Calculate exit fee
            (uint256 feeAmount, uint256 creatorRevenue) = StreamMathLib.calculateExitFee(spentIn, exitFeeRatio);

            // Update status
            status = StreamTypes.Status.FinalizedStreamed;
            saveStreamStatus(status);
            saveStream(state);

            // External calls last
            TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), feeCollector, feeAmount);
            
            // Call hook for final distribution
            uint256 adjustedCreatorRevenue = _afterFinalizeSuccess(creatorRevenue, outRemaining);
            emit FinalizedStreamed(address(this), creator, adjustedCreatorRevenue, feeAmount, outRemaining);
        } else {
            // Update status
            status = StreamTypes.Status.FinalizedRefunded;
            saveStreamStatus(status);
            saveStream(state);

            // Emit event before external call
            emit FinalizedRefunded(address(this), creator, outSupply);

            // Call hook for refund
            _afterFinalizeRefund(outSupply);
        }
    }

    /**
     * @dev Allows the creator to cancel the stream during the Waiting phase
     */
    function cancelStream() external onlyCreator {
        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        if (status != StreamTypes.Status.Waiting) {
            revert OperationNotAllowed();
        }

        // Store amount to transfer before updating state
        uint256 amountToTransfer = streamState.outSupply;

        // Update status
        status = StreamTypes.Status.Cancelled;
        saveStreamStatus(status);

        emit StreamCancelled(address(this), creator, amountToTransfer, uint8(status));
        TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), creator, amountToTransfer);
    }

    /**
     * @dev Allows the protocol admin to cancel the stream
     */
    function cancelWithAdmin() external onlyProtocolAdmin {
        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        if (
            status != StreamTypes.Status.Waiting &&
            status != StreamTypes.Status.Bootstrapping &&
            status != StreamTypes.Status.Active
        ) {
            revert OperationNotAllowed();
        }

        // Store amount to transfer before updating state
        uint256 amountToTransfer = streamState.outSupply;

        // Update status
        status = StreamTypes.Status.Cancelled;
        saveStreamStatus(status);

        emit StreamCancelled(address(this), creator, amountToTransfer, uint8(status));

        // External call last
        TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), creator, amountToTransfer);
    }

    /**
     * @dev Allows the creator to update the stream metadata
     */
    function updateStreamMetadata(string memory metadataIpfsHash) external onlyCreator {
        streamMetadata.ipfsHash = metadataIpfsHash;
        emit StreamMetadataUpdated(address(this), metadataIpfsHash);
    }

    // ============ External Sync Functions ============

    /**
     * @dev External function to sync the stream state and status
     */
    function syncStreamExternal() external {
        // Load, update and save stream state
        StreamTypes.StreamState memory state = loadStream();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        state = syncStream(state);
        saveStream(state);

        // Load, update and save status
        StreamTypes.Status status = loadStreamStatus();
        status = syncStreamStatus(status, times, block.timestamp);
        saveStreamStatus(status);

        emit StreamSynced(
            address(this),
            state.lastUpdated,
            uint8(status),
            state.distIndex.value,
            state.outRemaining,
            state.inSupply,
            state.spentIn,
            state.currentStreamedPrice.value
        );
    }

    /**
     * @dev External function to sync a specific user's position
     * @param user Address of the user whose position should be synced
     */
    function syncPositionExternal(address user) external {
        PositionTypes.Position memory position = loadPosition(user);
        validatePosition(position, user);
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);
        savePosition(user, position);
        saveStream(state);
        emit PositionSynced(
            address(this),
            user,
            position.inBalance,
            position.shares,
            position.lastUpdateTime,
            position.spentIn,
            position.purchased,
            position.index.value
        );
    }

    // ============ View Functions ============

    function getStreamStatus() external view returns (StreamTypes.Status) {
        return streamStatus;
    }

    function getStreamState() external view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    function getStreamMetadata() external view returns (StreamTypes.StreamMetadata memory) {
        return streamMetadata;
    }

    function getPostStreamActions() external view virtual returns (StreamTypes.PostStreamActions memory) {
        // Default empty actions in core; variants may override and return their own storage
        StreamTypes.PostStreamActions memory emptyActions;
        return emptyActions;
    }

    function getPosition(address user) external view returns (PositionTypes.Position memory) {
        IPositionStorage positionStorage = IPositionStorage(positionStorageAddress);
        return positionStorage.getPosition(user);
    }

    // ============ Internal Helper Functions ============

    function syncStream(StreamTypes.StreamState memory state) internal returns (StreamTypes.StreamState memory) {
        StreamTypes.StreamTimes memory times = loadStreamTimes();

        Decimal memory diff = StreamMathLib.calculateDiff(
            block.timestamp,
            times.streamStartTime,
            times.streamEndTime,
            state.lastUpdated
        );

        if (diff.value == 0) {
            state.lastUpdated = block.timestamp;
            return state;
        }

        state = StreamMathLib.calculateUpdatedState(
            state,
            diff,
            streamTokens.inToken.decimals,
            streamTokens.outToken.decimals
        );
        state.lastUpdated = block.timestamp;

        emit StreamStateUpdated(
            address(this),
            state.lastUpdated,
            state.distIndex.value,
            state.outRemaining,
            state.inSupply,
            state.spentIn,
            state.currentStreamedPrice.value
        );

        return state;
    }

    function syncStreamStatus(
        StreamTypes.Status status,
        StreamTypes.StreamTimes memory times,
        uint256 nowTime
    ) internal pure returns (StreamTypes.Status) {
        status = StreamMathLib.calculateStreamStatus(
            status,
            nowTime,
            times.bootstrappingStartTime,
            times.streamStartTime,
            times.streamEndTime
        );

        return status;
    }

    // ============ Load Functions ============

    function loadStream() internal view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    function loadStreamStatus() internal view returns (StreamTypes.Status) {
        return streamStatus;
    }

    function loadPosition(address user) internal view returns (PositionTypes.Position memory) {
        IPositionStorage positionStorage = IPositionStorage(positionStorageAddress);
        return positionStorage.getPosition(user);
    }

    function loadStreamTimes() internal view returns (StreamTypes.StreamTimes memory) {
        return streamTimes;
    }

    // ============ Save Functions ============

    function saveStream(StreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    function saveStreamStatus(StreamTypes.Status status) internal {
        streamStatus = status;
    }

    function savePosition(address user, PositionTypes.Position memory position) internal {
        IPositionStorage positionStorage = IPositionStorage(positionStorageAddress);
        positionStorage.updatePosition(user, position);
    }

    // ============ Validation Functions ============

    function validatePosition(PositionTypes.Position memory position, address user) internal pure {
        if (position.shares == 0) {
            revert InvalidPosition(user, position.shares, position.exitDate, "Position has no shares");
        }
        if (position.exitDate != 0) {
            revert InvalidPosition(user, position.shares, position.exitDate, "Position has already exited");
        }
    }

    // ============ UUPS Upgrade Authorization ============

    /**
     * @dev Function that should revert when `msg.sender` is not authorized to upgrade the contract
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyProtocolAdmin {
        // Only protocol admin can upgrade
        // Additional checks can be added here (e.g., timelock, phase restrictions)
    }
}
