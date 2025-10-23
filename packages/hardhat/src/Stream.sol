// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Stream
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Core streaming contract implementing time-based token distribution with dynamic pricing
 * @dev StreamSwap enables continuous token swaps where price is determined by community participation
 *      over time. Unlike traditional ICOs or Dutch auctions, StreamSwap uses a streaming mechanism
 *      where tokens are distributed continuously based on subscription timing and amounts.
 *      
 *      Key Features:
 *      - Dynamic pricing based on total participation and time
 *      - Threshold mechanism to ensure minimum viable participation
 *      - Bootstrapping phase for early commitment without immediate distribution
 *      - Proportional withdrawal and exit mechanisms
 *      - Post-stream vesting and automated liquidity pool creation
 *      - Emergency controls for creator and protocol admin
 *      
 *      Stream Lifecycle:
 *      1. Waiting: Stream created, no interactions allowed
 *      2. Bootstrapping: Users can subscribe, no distribution yet
 *      3. Active: Live streaming with continuous token distribution
 *      4. Ended: Stream concluded, users can exit, creator can finalize
 *      5. FinalizedStreamed: Stream finalized and streamed
 *      6. FinalizedRefunded: Stream finalized and refunded
 *      7. Cancelled: Emergency state, full refunds available
 */


import { PositionTypes } from "./types/PositionTypes.sol";
import { IPositionStorage } from "./interfaces/IPositionStorage.sol";
import { IStreamEvents } from "./interfaces/IStreamEvents.sol";
import { IStreamErrors } from "./interfaces/IStreamErrors.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { StreamFactory } from "./StreamFactory.sol";
import { StreamFactoryTypes } from "./types/StreamFactoryTypes.sol";
import { DecimalMath, Decimal } from "./lib/math/DecimalMath.sol";
import { StreamMathLib } from "./lib/math/StreamMathLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPoolWrapper } from "./interfaces/IPoolWrapper.sol";
import { IVestingFactory } from "./interfaces/IVestingFactory.sol";
import { IPermit2 } from "./interfaces/IPermit2.sol";
import { TransferLib } from "./lib/TransferLib.sol";

import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";

// import console 
import "hardhat/console.sol";


    
/**
 * @title Stream
 * @dev Main contract for managing token streaming with vesting and pool creation capabilities
 * @notice This contract handles the core streaming logic including subscriptions, withdrawals, exits, and finalization
 */
contract Stream is IStreamErrors, IStreamEvents {

    // ============ State Variables ============

    /// @notice Address of the stream creator
    address public creator;

    /// @notice Immutable address of the stream factory that deployed this stream
    address public immutable STREAM_FACTORY_ADDRESS;

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

    /// @notice Post-stream actions like vesting and pool creation
    StreamTypes.PostStreamActions public postStreamActions;

    /// @notice Address of the Permit2 contract
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

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
        StreamFactory factoryContract = StreamFactory(STREAM_FACTORY_ADDRESS);
        address protocolAdmin = factoryContract.getParams().protocolAdmin;
        if (msg.sender != protocolAdmin) revert Unauthorized();
        _;
    }

    // ============ Constructor ============

    /**
     * @dev Constructor to set the stream factory address
     * @param factoryAddress Address of the stream factory
     */
    constructor(address factoryAddress) {
        if (factoryAddress == address(0)) revert InvalidStreamFactoryAddress();
        STREAM_FACTORY_ADDRESS = factoryAddress;
    }

    // ============ Initialization ============

    /**
     * @dev Initializes the stream with the provided configuration
     * @param createStreamMessage Stream creation parameters
     * @param storageAddress Address of the position storage contract
     * @notice This function can only be called once by the stream factory
     */
    function initialize(
        StreamTypes.CreateStreamMessage memory createStreamMessage,
        address storageAddress
    ) external onlyOnce onlyStreamFactory {
        if (storageAddress == address(0)) revert InvalidPositionStorageAddress();

        // Validate and set creator vesting info
        if (createStreamMessage.creatorVesting.isVestingEnabled) {
            postStreamActions.creatorVesting = createStreamMessage.creatorVesting;
        }
        
        // Validate and set beneficiary vesting info
        if (createStreamMessage.beneficiaryVesting.isVestingEnabled) {
            postStreamActions.beneficiaryVesting = createStreamMessage.beneficiaryVesting;
        }
        
        // Validate pool config
        if (createStreamMessage.poolInfo.poolOutSupplyAmount > 0) {
            // Validate pool amount is less than or equal to out amount
            if (createStreamMessage.poolInfo.poolOutSupplyAmount > createStreamMessage.streamOutAmount) {
                revert InvalidPoolOutSupplyAmount();
            }
            // Validate pool type
            if (createStreamMessage.poolInfo.dexType != StreamTypes.DexType.V2 && createStreamMessage.poolInfo.dexType != StreamTypes.DexType.V3) {
                revert InvalidPoolType();
            }
            postStreamActions.poolInfo = createStreamMessage.poolInfo;
        }
        
        // Save position storage address
        positionStorageAddress = storageAddress;
        
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
            inSupplyToken: createStreamMessage.inSupplyToken,
            outSupplyToken: createStreamMessage.outSupplyToken
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
    }

    // ============ Core Stream Functions ============

    /**
     * @dev Internal function containing the core subscription logic
     *      Assumes `amountIn` tokens have already been transferred to this contract.
     * @param amountIn Amount of input tokens to subscribe with
     * @notice Business logic for updating positions and stream state.
     */
    function _subscribeCore(uint256 amountIn) internal {
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

        // Load and sync position
        PositionTypes.Position memory position = loadPosition(msg.sender);
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Calculate shares before any state changes
        uint256 newShares = StreamMathLib.computeSharesAmount(amountIn, false, state.inSupply, state.shares);

        // Update position
        position.inBalance += amountIn;
        position.shares += newShares;

        // Update stream state
        state.inSupply += amountIn;
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
    }

    /**
     * @dev Allows users to subscribe to the stream by providing input tokens
     * @param amountIn Amount of input tokens to subscribe with
     * @notice Users can subscribe during Bootstrapping or Active phases
     */
    function subscribe(uint256 amountIn) external {
        if (streamTokens.inSupplyToken == address(0)) revert InvalidInputToken();
        // Pull funds (ERC20)
        TransferLib.transferFunds(streamTokens.inSupplyToken, msg.sender, address(this), amountIn);
        _subscribeCore(amountIn);
    }

    function subscribeWithNativeToken(uint256 amountIn) external payable {
        if (streamTokens.inSupplyToken != address(0)) revert InvalidInputToken();
        // Pull funds (native)
        TransferLib.transferFunds(address(0), msg.sender, address(this), amountIn);
        _subscribeCore(amountIn);
    }

    /**
     * @dev Allows users to subscribe using Permit2 signature-based allowance.
     *      The Permit2 signature (PermitSingle) is verified and consumed, then the
     *      tokens are pulled from `owner` to this Stream contract. The rest of the
     *      logic mirrors the regular `subscribe` flow.
     * @param amountIn      Amount of input tokens user wants to contribute
     * @param owner         Address that actually holds the tokens (signer of permit)
     * @param permitSingle  Full Permit2 data struct describing the allowance
     * @param signature     EIP-712 signature over `permitSingle`
     */
    function subscribeWithPermit(
        uint256 amountIn,
        address owner,
        IPermit2.PermitSingle calldata permitSingle,
        bytes calldata signature
    ) external {
        // Validate the permit matches the stream requirements
        if (permitSingle.details.token != streamTokens.inSupplyToken) revert InvalidAmount();
        if (permitSingle.details.amount < uint160(amountIn)) revert InvalidAmount();
        if (permitSingle.spender != address(this)) revert InvalidAmount();
        if (permitSingle.sigDeadline < block.timestamp) revert InvalidAmount();

        // Execute Permit2 flow
        IPermit2 permit2 = IPermit2(PERMIT2);
        // 1. Validate & store allowance via signature
        permit2.permit(owner, permitSingle, signature);
        // 2. Pull tokens from owner to the stream contract
        permit2.transferFrom(owner, address(this), uint160(amountIn), streamTokens.inSupplyToken);

        // Tokens are now in this contract — proceed with core logic
        _subscribeCore(amountIn);
    }

    /**
     * @dev Allows users to withdraw their input tokens from the stream
     * @param cap Amount of input tokens to withdraw
     * @notice Users can withdraw during Active or Bootstrapping phases
     * @dev If cap is 0, the user will withdraw all their input tokens
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
        TransferLib.transferFunds(streamTokens.inSupplyToken, address(this), msg.sender, withdrawAmount);
    }

    /**
     * @dev Allows users to exit the stream and receive their tokens based on stream outcome
     * @notice Users can exit after the stream has ended or been cancelled
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
            // Case 1: Successful exit - return unused input tokens and deliver output
            // This case is highly unlikely to happen because the stream is designed to spend all input tokens if stream is ended
            if (inBalance > 0) {
                TransferLib.transferFunds(streamTokens.inSupplyToken, address(this), msg.sender, inBalance);
            }

            if (postStreamActions.beneficiaryVesting.isVestingEnabled) {
                StreamFactory factoryContract = StreamFactory(STREAM_FACTORY_ADDRESS);
                StreamFactoryTypes.Params memory params = factoryContract.getParams();
                IVestingFactory vestingFactory = IVestingFactory(params.vestingFactoryAddress);

                IERC20(streamTokens.outSupplyToken).approve(params.vestingFactoryAddress, purchased);
                address vestingAddress = vestingFactory.createVestingWalletWithTokens(
                    msg.sender,
                    uint64(block.timestamp),
                    postStreamActions.beneficiaryVesting.vestingDuration,
                    streamTokens.outSupplyToken,
                    purchased
                );
                emit BeneficiaryVestingCreated(msg.sender, vestingAddress, postStreamActions.beneficiaryVesting.vestingDuration, streamTokens.outSupplyToken, purchased);
            } else {
                TransferLib.transferFunds(streamTokens.outSupplyToken, address(this), msg.sender, purchased);
            }

            emit ExitStreamed(address(this), msg.sender, purchased, spentIn, position.index.value, inBalance, block.timestamp);
        } else if (isRefund) {
            // Case 2: Refund exit - return all input tokens
            uint256 totalRefund = inBalance + spentIn;
            position.purchased = 0;
            position.spentIn = 0;
            position.inBalance = totalRefund;
            savePosition(msg.sender, position);
            TransferLib.transferFunds(streamTokens.inSupplyToken, address(this), msg.sender, totalRefund);
            emit ExitRefunded(address(this), msg.sender, position.inBalance, position.spentIn, block.timestamp);
        } else {
            // Case 3: No exit allowed
            revert OperationNotAllowed();
        }
      
    }

    // ============ Stream Management Functions ============

    /**
     * @dev Allows the creator to finalize the stream after it has ended
     * @notice Only the creator can call this function when stream status is Ended
     */
    function finalizeStream() external onlyCreator {
        // Get factory params
        StreamFactory factoryContract = StreamFactory(STREAM_FACTORY_ADDRESS);
        StreamFactoryTypes.Params memory params = factoryContract.getParams();

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
            address feeCollector = params.feeCollector;
            Decimal memory exitFeeRatio = params.exitFeeRatio;

            // Calculate exit fee
            (uint256 feeAmount, uint256 creatorRevenue) = StreamMathLib.calculateExitFee(spentIn, exitFeeRatio);

            // Handle pool creation if configured
            uint256 poolInSupplyAmount = 0;
            uint256 poolOutSupplyAmount = 0;
            if (postStreamActions.poolInfo.poolOutSupplyAmount > 0) {
                // Calculate pool ratio
                Decimal memory poolRatio = DecimalMath.div(
                    DecimalMath.fromNumber(postStreamActions.poolInfo.poolOutSupplyAmount),
                    DecimalMath.fromNumber(streamState.outSupply)
                );

                Decimal memory decimalCreatorRevenue = DecimalMath.fromNumber(creatorRevenue);
                Decimal memory decimalPoolAmount = DecimalMath.mul(decimalCreatorRevenue, poolRatio);

                poolInSupplyAmount = DecimalMath.floor(decimalPoolAmount);
                poolOutSupplyAmount = postStreamActions.poolInfo.poolOutSupplyAmount;
                // Calculate remaining revenue
                creatorRevenue = creatorRevenue - poolInSupplyAmount;
            }

            // Update status
            status = StreamTypes.Status.FinalizedStreamed;
            saveStreamStatus(status);
            saveStream(state);

            // Emit event before external calls
            emit FinalizedStreamed(address(this), creator, creatorRevenue, feeAmount, outRemaining);

            // External calls last
            TransferLib.transferFunds(streamTokens.inSupplyToken, address(this), feeCollector, feeAmount);

            if (poolOutSupplyAmount > 0) {
                createPoolAndAddLiquidity(
                    streamTokens.inSupplyToken,
                    streamTokens.outSupplyToken,
                    poolInSupplyAmount,
                    poolOutSupplyAmount,
                    postStreamActions.poolInfo.dexType,
                    creator
                );
            }

            if (postStreamActions.creatorVesting.isVestingEnabled) {
                IVestingFactory vestingFactory = IVestingFactory(params.vestingFactoryAddress);
                IERC20(streamTokens.inSupplyToken).approve(params.vestingFactoryAddress, creatorRevenue);
                address vestingAddress = vestingFactory.createVestingWalletWithTokens(
                    creator,
                    uint64(block.timestamp),
                    postStreamActions.creatorVesting.vestingDuration,
                    streamTokens.inSupplyToken,
                    creatorRevenue
                );
                emit CreatorVestingCreated(creator, vestingAddress, postStreamActions.creatorVesting.vestingDuration, streamTokens.inSupplyToken, creatorRevenue);
            } else {
                TransferLib.transferFunds(streamTokens.inSupplyToken, address(this), creator, creatorRevenue);
            }

            if (outRemaining > 0) {
                TransferLib.transferFunds(streamTokens.outSupplyToken, address(this), creator, outRemaining);
            }
        } else {
            // Update status
            status = StreamTypes.Status.FinalizedRefunded;
            saveStreamStatus(status);
            saveStream(state);

            // Emit event before external call
            emit FinalizedRefunded(address(this), creator, outSupply);

            // External call last
            TransferLib.transferFunds(streamTokens.outSupplyToken, address(this), creator, outSupply);
        }
    }

    /**
     * @dev Allows the creator to cancel the stream during the Waiting phase
     * @notice Only the creator can cancel during Waiting phase
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
        TransferLib.transferFunds(streamTokens.outSupplyToken, address(this), creator, amountToTransfer);
    }

    /**
     * @dev Allows the protocol admin to cancel the stream during Waiting, Bootstrapping, or Active phases
     * @notice Only the protocol admin can call this function
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
        TransferLib.transferFunds(streamTokens.outSupplyToken, address(this), creator, amountToTransfer);
    }

    /**
     * @dev Allows the creator to update the stream metadata
     * @notice Only the creator can call this function
     */
    function updateStreamMetadata(string memory metadataIpfsHash) external onlyCreator {
        streamMetadata.ipfsHash = metadataIpfsHash;
        emit StreamMetadataUpdated(address(this), metadataIpfsHash);
    }

    // ============ External Sync Functions ============

    /**
     * @dev External function to sync the stream state and status
     * @notice Anyone can call this to update the stream state based on current time
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
     * @notice Anyone can call this to update a user's position based on current stream state
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

    /**
     * @dev Get the current stream status
     * @return The current stream status
     */
    function getStreamStatus() external view returns (StreamTypes.Status) {
        return streamStatus;
    }

    /**
     * @dev Get the current stream state
     * @return The current stream state
     */
    function getStreamState() external view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    /**
     * @dev Get a user's position information
     * @param user Address of the user
     * @return The user's position
     */
    function getPosition(address user) external view returns (PositionTypes.Position memory) {
        IPositionStorage positionStorage = IPositionStorage(positionStorageAddress);
        return positionStorage.getPosition(user);
    }

    // ============ Internal Helper Functions ============

    // ============ State Management ============

    /**
     * @dev Synchronizes the stream state based on the current timestamp
     * @param state The current stream state to update
     * @return The updated stream state
     */
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

        state = StreamMathLib.calculateUpdatedState(state, diff);
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

    /**
     * @dev Syncs the stream status based on current time and stream times
     * @param status Current stream status
     * @param times Stream timing information
     * @param nowTime Current timestamp
     * @return Updated stream status
     */
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

    /**
     * @dev Loads the current stream state
     * @return Current stream state
     */
    function loadStream() internal view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    /**
     * @dev Loads the current stream status
     * @return Current stream status
     */
    function loadStreamStatus() internal view returns (StreamTypes.Status) {
        return streamStatus;
    }

    /**
     * @dev Loads a user's position from storage
     * @param user Address of the user
     * @return User's position
     */
    function loadPosition(address user) internal view returns (PositionTypes.Position memory) {
        IPositionStorage positionStorage = IPositionStorage(positionStorageAddress);
        return positionStorage.getPosition(user);
    }

    /**
     * @dev Loads the stream timing information
     * @return Stream timing information
     */
    function loadStreamTimes() internal view returns (StreamTypes.StreamTimes memory) {
        return streamTimes;
    }

    // ============ Save Functions ============

    /**
     * @dev Saves the stream state
     * @param state Stream state to save
     */
    function saveStream(StreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    /**
     * @dev Saves the stream status
     * @param status Stream status to save
     */
    function saveStreamStatus(StreamTypes.Status status) internal {
        streamStatus = status;
    }

    /**
     * @dev Saves a user's position to storage
     * @param user Address of the user
     * @param position Position to save
     */
    function savePosition(address user, PositionTypes.Position memory position) internal {
        IPositionStorage positionStorage = IPositionStorage(positionStorageAddress);
        positionStorage.updatePosition(user, position);
    }

    // ============ Validation Functions ============

    /**
     * @dev Validates a position and reverts if invalid
     * @param position The position to validate
     * @param user The address of the user whose position is being validated
     * @custom:error InvalidPosition if position is invalid or inactive
     */
    function validatePosition(PositionTypes.Position memory position, address user) internal pure {
        if (position.shares == 0) {
            revert InvalidPosition(user, position.shares, position.exitDate, "Position has no shares");
        }
        if (position.exitDate != 0) {
            revert InvalidPosition(user, position.shares, position.exitDate, "Position has already exited");
        }
    }

    // ============ Pool Management ============

    /**
     * @dev Creates a pool and adds liquidity using the pool wrapper
     * @param tokenA First token address
     * @param tokenB Second token address
     * @param amountADesired Amount of token A to add
     * @param amountBDesired Amount of token B to add
     */
    function createPoolAndAddLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        StreamTypes.DexType dexType,
        address streamCreator
    ) internal {

        StreamFactory factoryContract = StreamFactory(STREAM_FACTORY_ADDRESS);
        StreamFactoryTypes.Params memory params = factoryContract.getParams();

        address poolWrapperAddress;
        if (dexType == StreamTypes.DexType.V2) {
            poolWrapperAddress = params.V2PoolWrapperAddress;
        } else if (dexType == StreamTypes.DexType.V3) {
            poolWrapperAddress = params.V3PoolWrapperAddress;
        } else if (dexType == StreamTypes.DexType.Aerodrome) {
            poolWrapperAddress = params.AerodromePoolWrapperAddress;
        } else {
            revert InvalidDexType();
        }
        IPoolWrapper poolWrapper = IPoolWrapper(poolWrapperAddress);

        // Transfer pool tokens to the pool wrapper contract first
        TransferLib.transferFunds(tokenA, address(this), poolWrapperAddress, amountADesired);
        TransferLib.transferFunds(tokenB, address(this), poolWrapperAddress, amountBDesired);

        // Sort tokens
        (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) = _sortTokens(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired
        );

        // Create the pool message
        PoolWrapperTypes.CreatePoolMsg memory createPoolMsg = PoolWrapperTypes.CreatePoolMsg({
            token0: token0,
            token1: token1,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            creator: streamCreator
        });
        
        // Create the pool and get the result
        PoolWrapperTypes.CreatedPoolInfo memory createdPoolInfo = poolWrapper.createPool(createPoolMsg);

        emit PoolCreated(
            address(this),
            createdPoolInfo.poolAddress,
            createdPoolInfo.token0,
            createdPoolInfo.token1,
            createdPoolInfo.amount0,
            createdPoolInfo.amount1,
            createdPoolInfo.refundedAmount0,
            createdPoolInfo.refundedAmount1,
            createdPoolInfo.creator
        );
    }

    function _sortTokens(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) internal pure returns (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) {
        if (tokenA < tokenB) {
            return (tokenA, tokenB, amountA, amountB);
        }
        return (tokenB, tokenA, amountB, amountA);
    }
}
