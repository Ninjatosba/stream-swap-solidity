// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IPositionStorage.sol";
import "./types/PositionTypes.sol";
import "./interfaces/IStreamEvents.sol";
import "./interfaces/IStreamErrors.sol";
import "./types/StreamTypes.sol";
import "./StreamFactory.sol";
import "./types/StreamFactoryTypes.sol";
import "./lib/math/DecimalMath.sol";
import "./lib/math/StreamMathLib.sol";
import "./interfaces/IERC20.sol";
import "hardhat/console.sol";
import "./lib/helpers/TokenHelpers.sol";
import "./interfaces/IPoolWrapper.sol";
import "./interfaces/IVesting.sol";
import "./types/PoolWrapperTypes.sol";

contract Stream is IStreamErrors, IStreamEvents {
    address public creator;
    address immutable streamFactoryAddress;
    address public positionStorageAddress;
    bool private initialized;

    StreamTypes.StreamState public streamState;
    StreamTypes.StreamTokens public streamTokens;
    StreamTypes.StreamMetadata public streamMetadata;
    StreamTypes.Status public streamStatus;
    StreamTypes.StreamTimes public streamTimes;
    StreamTypes.PostStreamActions public postStreamActions;

    modifier onlyOnce() {
        if (initialized) revert Unauthorized();
        _;
        initialized = true;
    }

    modifier onlyAdmin() {
        if (msg.sender != streamFactoryAddress) revert Unauthorized();
        _;
    }

    constructor(address _streamFactoryAddress) {
        streamFactoryAddress = _streamFactoryAddress;
    }

    function initialize(
        StreamTypes.createStreamMessage memory createStreamMessage,
        address _positionStorageAddress
    ) external onlyOnce onlyAdmin {
        // Validate that output token is a valid ERC20
        if (!TokenHelpers.isValidERC20(createStreamMessage.outSupplyToken, msg.sender)) revert InvalidOutSupplyToken();
        // Check if the contract has enough balance of output token
        uint256 totalRequiredAmount = createStreamMessage.streamOutAmount +
            createStreamMessage.poolInfo.poolOutSupplyAmount;
        if (!TokenHelpers.hasEnoughBalance(createStreamMessage.outSupplyToken, address(this), totalRequiredAmount))
            revert InsufficientOutAmount();
        // Validate and set creator vesting info
        if (createStreamMessage.creatorVesting.isVestingEnabled) {
            // Validate vesting duration
            if (createStreamMessage.creatorVesting.vestingDuration == 0) {
                revert InvalidVestingDuration();
            }
            if (createStreamMessage.creatorVesting.cliffDuration == 0) {
                revert InvalidVestingCliffDuration();
            }
            if (
                createStreamMessage.creatorVesting.cliffDuration >= createStreamMessage.creatorVesting.vestingDuration
            ) {
                revert InvalidVestingCliffDuration();
            }
            // set vesting info
            postStreamActions.creatorVesting = createStreamMessage.creatorVesting;
        }
        // Validate and set beneficiary vesting info
        if (createStreamMessage.beneficiaryVesting.isVestingEnabled) {
            // Validate vesting duration
            if (createStreamMessage.beneficiaryVesting.vestingDuration == 0) {
                revert InvalidVestingDuration();
            }
            if (createStreamMessage.beneficiaryVesting.cliffDuration == 0) {
                revert InvalidVestingCliffDuration();
            }
            if (
                createStreamMessage.beneficiaryVesting.cliffDuration >=
                createStreamMessage.beneficiaryVesting.vestingDuration
            ) {
                revert InvalidVestingCliffDuration();
            }
            // set vesting info
            postStreamActions.beneficiaryVesting = createStreamMessage.beneficiaryVesting;
        }
        // Validate pool config
        if (createStreamMessage.poolInfo.poolOutSupplyAmount > 0) {
            // Validate pool amount is less than or equal to out amount
            if (createStreamMessage.poolInfo.poolOutSupplyAmount > createStreamMessage.streamOutAmount) {
                revert InvalidAmount();
            }
            postStreamActions.poolInfo = createStreamMessage.poolInfo;
        }
        // Save position storage address
        positionStorageAddress = _positionStorageAddress;
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

    function saveStreamState(StreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    function loadStreamState() internal view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    // ============ Position Validation ============

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

    // ============ Stream State Validation ============

    /**
     * @dev Validates if an operation is allowed based on the current stream status
     * @param currentStatus Current status to check
     * @param allowedStatuses Array of allowed statuses for the operation
     * @custom:error OperationNotAllowed if current status is not in allowed statuses
     */
    function validateOperationAllowed(
        StreamTypes.Status currentStatus,
        StreamTypes.Status[] memory allowedStatuses
    ) internal pure {
        for (uint256 i = 0; i < allowedStatuses.length; i++) {
            if (currentStatus == allowedStatuses[i]) {
                return;
            }
        }
        revert OperationNotAllowed();
    }

    /**
     * @dev Validates if the threshold has been reached for stream finalization
     * @param state The stream state to check
     * @return bool True if the threshold has been reached, false otherwise
     */
    function isThresholdReached(StreamTypes.StreamState memory state) internal pure returns (bool) {
        return state.spentIn >= state.threshold;
    }

    // ============ Access Control ============

    /**
     * @dev Ensures sender is the creator
     * @custom:error Unauthorized if sender is not the creator
     */
    function validateIsCreator() internal view {
        if (msg.sender != creator) revert Unauthorized();
    }

    /**
     * @dev Ensures sender is the protocol admin
     * @custom:error Unauthorized if sender is not the protocol admin
     */
    function validateIsProtocolAdmin() internal view {
        StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
        address protocolAdmin = factoryContract.getParams().protocolAdmin;
        if (msg.sender != protocolAdmin) revert Unauthorized();
    }

    // ============ Amount Validation ============

    /**
     * @dev Ensures amount is not zero
     * @param amount Amount to check
     * @custom:error InvalidAmount if amount is zero
     */
    function validateAmountNotZero(uint256 amount) internal pure {
        if (amount == 0) revert InvalidAmount();
    }

    /**
     * @dev Ensures withdrawal amount does not exceed balance
     * @param cap Amount to withdraw
     * @param balance Available balance
     * @custom:error WithdrawAmountExceedsBalance if cap exceeds balance
     */
    function validateWithinBalance(uint256 cap, uint256 balance) internal pure {
        if (cap > balance) revert WithdrawAmountExceedsBalance(cap);
    }

    function subscribe(uint256 amountIn) external payable {
        validateAmountNotZero(amountIn);

        // Load and validate stream state
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Validate operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](2);
        allowedStatuses[0] = StreamTypes.Status.Bootstrapping;
        allowedStatuses[1] = StreamTypes.Status.Active;
        validateOperationAllowed(status, allowedStatuses);
        saveStreamStatus(status);

        // Load and sync stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        // Load and sync position
        // If first time subscribing, sync position will set distIndex and lastUpdated
        PositionTypes.Position memory position = loadPosition(msg.sender);
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Transfer tokens
        if (!TokenHelpers.safeTransferFrom(streamTokens.inSupplyToken, msg.sender, address(this), amountIn)) {
            revert PaymentFailed();
        }

        // Calculate and update shares
        uint256 newShares = StreamMathLib.computeSharesAmount(amountIn, false, state.inSupply, state.shares);

        // Update position
        position.inBalance += amountIn;
        position.shares += newShares;

        // Update stream state
        state.inSupply += amountIn;
        state.shares += newShares;

        // Save states
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

    function withdraw(uint256 cap) external {
        validateAmountNotZero(cap);

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
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](2);
        allowedStatuses[0] = StreamTypes.Status.Active;
        allowedStatuses[1] = StreamTypes.Status.Bootstrapping;
        validateOperationAllowed(status, allowedStatuses);

        // Save the updated status
        saveStreamStatus(status);

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        // Sync position with the updated state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Check if withdrawal amount exceeds position balance
        validateWithinBalance(cap, position.inBalance);

        uint256 shareDeduction = 0;

        if (cap == position.inBalance) {
            shareDeduction = position.shares;
        } else {
            shareDeduction = StreamMathLib.computeSharesAmount(cap, true, state.inSupply, position.shares);
        }

        // Update position
        position.shares = position.shares - shareDeduction;
        position.inBalance = position.inBalance - cap;

        // Update stream state
        state.inSupply = state.inSupply - cap;
        state.shares = state.shares - shareDeduction;

        // Save position and stream state
        savePosition(msg.sender, position);
        saveStream(state);

        // Token transfer
        TokenHelpers.safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, cap);

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
    }

    function exitStream() external {
        // Load position
        PositionTypes.Position memory position = loadPosition(msg.sender);

        // Check if position is valid and active
        validatePosition(position, msg.sender);

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        // Sync position with updated state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        bool thresholdReached = isThresholdReached(state);

        // Handle token distributions based on exit scenario
        handleExitDistribution(status, thresholdReached, position, postStreamActions.beneficiaryVesting);

        // Set exit date
        position.exitDate = block.timestamp;

        // Save everything
        saveStreamStatus(status);
        saveStream(state);
        savePosition(msg.sender, position);
    }

    function handleExitDistribution(
        StreamTypes.Status status,
        bool thresholdReached,
        PositionTypes.Position memory position,
        StreamTypes.VestingInfo memory vestingInfo
    ) internal {
        // Case 1: Successful stream completion
        if (isSuccessfulExit(status, thresholdReached)) {
            // Return any unused input tokens
            if (position.inBalance > 0) {
                TokenHelpers.safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, position.inBalance);
            }
            if (vestingInfo.isVestingEnabled) {
                // Distribute earned output tokens
                uint256 amountToDistribute = position.purchased;
                // Load factory params
                StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
                StreamFactoryTypes.Params memory params = factoryContract.getParams();
                address vestingContractAddress = params.vestingAddress;
                IVesting vestingContract = IVesting(vestingContractAddress);
                // Create vesting schedule
                (uint256 cliffTime, uint256 endTime) = StreamMathLib.calculateVestingSchedule(
                    block.timestamp,
                    vestingInfo.cliffDuration,
                    vestingInfo.vestingDuration
                );
                // Approve vesting contract
                TokenHelpers.safeTokenApprove(streamTokens.outSupplyToken, vestingContractAddress, amountToDistribute);
                // Create vesting schedule
                vestingContract.stakeFunds(
                    msg.sender,
                    streamTokens.outSupplyToken,
                    cliffTime,
                    endTime,
                    amountToDistribute
                );
            } else {
                // Direct transfer if vesting is not enabled
                TokenHelpers.safeTokenTransfer(streamTokens.outSupplyToken, msg.sender, position.purchased);
            }
            emit ExitStreamed(address(this), msg.sender, position.purchased, position.spentIn, block.timestamp);
            return;
        }

        // Case 2: Refund scenario
        if (isRefundExit(status, thresholdReached)) {
            // Full refund of all input tokens (both spent and unspent)
            uint256 totalRefund = position.inBalance + position.spentIn;
            TokenHelpers.safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, totalRefund);
            emit ExitRefunded(address(this), msg.sender, totalRefund, block.timestamp);
            return;
        }

        // If neither condition is met, the exit is not allowed
        revert InvalidExitCondition();
    }

    function isSuccessfulExit(StreamTypes.Status status, bool thresholdReached) internal pure returns (bool) {
        return
            (status == StreamTypes.Status.Ended && thresholdReached) ||
            (status == StreamTypes.Status.FinalizedStreamed);
    }

    function isRefundExit(StreamTypes.Status status, bool thresholdReached) internal pure returns (bool) {
        return
            status == StreamTypes.Status.Cancelled ||
            status == StreamTypes.Status.FinalizedRefunded ||
            (status == StreamTypes.Status.Ended && !thresholdReached);
    }

    function finalizeStream() external {
        validateIsCreator();

        // Get factory params
        StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
        StreamFactoryTypes.Params memory params = factoryContract.getParams();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](1);
        allowedStatuses[0] = StreamTypes.Status.Ended;
        validateOperationAllowed(status, allowedStatuses);

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        bool thresholdReached = isThresholdReached(state);

        if (thresholdReached) {
            address feeCollector = params.feeCollector;
            Decimal memory exitFeeRatio = params.exitFeeRatio;

            // Calculate exit fee
            (uint256 feeAmount, uint256 creatorRevenue) = StreamMathLib.calculateExitFee(state.spentIn, exitFeeRatio);
            // Transfer fee to fee collector
            TokenHelpers.safeTokenTransfer(streamTokens.inSupplyToken, feeCollector, feeAmount);

            // Handle pool creation if configured
            if (postStreamActions.poolInfo.poolOutSupplyAmount > 0) {
                // Calculate pool ratio
                Decimal memory poolRatio = DecimalMath.div(
                    DecimalMath.fromNumber(postStreamActions.poolInfo.poolOutSupplyAmount),
                    DecimalMath.fromNumber(streamState.outSupply)
                );

                uint256 poolInSupplyAmount = StreamMathLib.calculatePoolAmount(creatorRevenue, poolRatio);
                uint256 poolOutSupplyAmount = postStreamActions.poolInfo.poolOutSupplyAmount;
                // Calculate remaining revenue
                creatorRevenue = creatorRevenue - poolInSupplyAmount;

                // Create pool and add liquidity
                createPoolAndAddLiquidity(
                    streamTokens.inSupplyToken,
                    streamTokens.outSupplyToken,
                    poolInSupplyAmount,
                    poolOutSupplyAmount
                );
            }

            // Handle vesting if enabled
            if (postStreamActions.creatorVesting.isVestingEnabled) {
                // Create vesting schedule
                (uint256 cliffTime, uint256 endTime) = StreamMathLib.calculateVestingSchedule(
                    block.timestamp,
                    postStreamActions.creatorVesting.cliffDuration,
                    postStreamActions.creatorVesting.vestingDuration
                );
                createVesting(
                    creator,
                    streamTokens.inSupplyToken,
                    params.vestingAddress,
                    creatorRevenue,
                    cliffTime,
                    endTime
                );
            } else {
                // Transfer creator revenue to creator
                TokenHelpers.safeTokenTransfer(streamTokens.inSupplyToken, creator, creatorRevenue);
            }

            // Update status
            status = StreamTypes.Status.FinalizedStreamed;

            // Refund out tokens to creator if left any
            if (state.outRemaining > 0) {
                TokenHelpers.safeTokenTransfer(streamTokens.outSupplyToken, creator, state.outRemaining);
            }

            emit FinalizedStreamed(address(this), creator, creatorRevenue, feeAmount, state.outRemaining);
        } else {
            // Update status
            status = StreamTypes.Status.FinalizedRefunded;

            // Refund out tokens to creator
            TokenHelpers.safeTokenTransfer(streamTokens.outSupplyToken, creator, state.outSupply);

            emit FinalizedRefunded(address(this), creator, state.outSupply);
        }

        // Save everything
        saveStreamStatus(status);
        saveStream(state);
    }

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

    function cancelStream() external {
        validateIsCreator();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](1);
        allowedStatuses[0] = StreamTypes.Status.Waiting;
        validateOperationAllowed(status, allowedStatuses);

        // Refund out tokens to creator
        TokenHelpers.safeTokenTransfer(streamTokens.outSupplyToken, creator, streamState.outSupply);

        // Update status
        status = StreamTypes.Status.Cancelled;
        saveStreamStatus(status);

        emit StreamCancelled(address(this), creator, streamState.outSupply, uint8(status));
    }

    function cancelWithAdmin() external {
        validateIsProtocolAdmin();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](3);
        allowedStatuses[0] = StreamTypes.Status.Waiting;
        allowedStatuses[1] = StreamTypes.Status.Bootstrapping;
        allowedStatuses[2] = StreamTypes.Status.Active;
        validateOperationAllowed(status, allowedStatuses);

        // Refund out tokens to creator
        TokenHelpers.safeTokenTransfer(streamTokens.outSupplyToken, creator, streamState.outSupply);

        // Update status
        status = StreamTypes.Status.Cancelled;
        saveStreamStatus(status);

        emit StreamCancelled(address(this), creator, streamState.outSupply, uint8(status));
    }

    // Load helpers
    function loadStream() internal view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    function loadStreamStatus() internal view returns (StreamTypes.Status) {
        return streamStatus;
    }

    function loadPosition(address user) internal view returns (PositionTypes.Position memory) {
        PositionStorage positionStorage = PositionStorage(positionStorageAddress);
        return positionStorage.getPosition(user);
    }

    function loadStreamTimes() internal view returns (StreamTypes.StreamTimes memory) {
        return streamTimes;
    }

    // Save helpers
    function saveStream(StreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    function saveStreamStatus(StreamTypes.Status status) internal {
        streamStatus = status;
    }

    function savePosition(address user, PositionTypes.Position memory position) internal {
        PositionStorage positionStorage = PositionStorage(positionStorageAddress);
        positionStorage.updatePosition(user, position);
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

    function getPosition(address user) external view returns (PositionTypes.Position memory) {
        PositionStorage positionStorage = PositionStorage(positionStorageAddress);
        return positionStorage.getPosition(user);
    }

    function createPoolAndAddLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal {
        StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
        StreamFactoryTypes.Params memory params = factoryContract.getParams();

        address poolWrapperAddress = params.poolWrapperAddress;
        IPoolWrapper poolWrapper = IPoolWrapper(poolWrapperAddress);

        PoolWrapperTypes.CreatePoolMsg memory createPoolMsg = PoolWrapperTypes.CreatePoolMsg({
            token0: tokenA,
            token1: tokenB,
            amount0: amountADesired,
            amount1: amountBDesired
        });
        poolWrapper.createPool(createPoolMsg);

        // Transfer pool tokens to stream
        TokenHelpers.safeTokenTransfer(tokenA, poolWrapperAddress, amountADesired);
        TokenHelpers.safeTokenTransfer(tokenB, poolWrapperAddress, amountBDesired);
    }

    function createVesting(
        address beneficiary,
        address token,
        address vestingAddress,
        uint256 amount,
        uint256 cliffTime,
        uint256 endTime
    ) internal {
        IVesting vesting = IVesting(vestingAddress);
        TokenHelpers.safeTokenTransfer(token, vestingAddress, amount);
        vesting.stakeFunds(beneficiary, token, cliffTime, endTime, amount);
    }
}
