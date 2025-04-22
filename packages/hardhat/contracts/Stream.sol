// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./PositionStorage.sol";
import "./types/PositionTypes.sol";
import "./StreamEvents.sol";
import "./StreamErrors.sol";
import "./types/StreamTypes.sol";
import "./StreamFactory.sol";
import "./lib/math/DecimalMath.sol";
import "./lib/math/StreamMathLib.sol";
import "./interfaces/IERC20.sol";
import "hardhat/console.sol";

import "./interfaces/IVesting.sol";
import "./interfaces/IUniswapV2.sol";

contract Stream is IStreamErrors, IStreamEvents {
    address public creator;
    address public positionStorageAddress;
    string public name;

    StreamTypes.StreamState public streamState;
    StreamTypes.StreamTokens public streamTokens;
    StreamTypes.StreamMetadata public streamMetadata;
    StreamTypes.Status public streamStatus;
    StreamTypes.StreamTimes public streamTimes;
    StreamTypes.VestingInfo public creatorVestingInfo;
    StreamTypes.VestingInfo public beneficiaryVestingInfo;
    StreamTypes.PoolConfig public poolConfig;
    address public streamFactoryAddress;
    PositionStorage public positionStorage;

    // constructor should return its address
    constructor(
        uint256 _streamOutAmount,
        address _outSupplyToken,
        uint256 _bootstrappingStartTime,
        uint256 _streamStartTime,
        uint256 _streamEndTime,
        uint256 _threshold,
        string memory _name,
        address _inSupplyToken,
        address _creator,
        StreamTypes.VestingInfo memory _creatorVestingInfo,
        StreamTypes.VestingInfo memory _beneficiaryVestingInfo,
        StreamTypes.PoolConfig memory _poolConfig
    ) {
        // Validate that output token is a valid ERC20
        if (!isValidERC20(_outSupplyToken, msg.sender)) {
            revert InvalidOutSupplyToken();
        }

        // Check if the contract has enough balance of output token
        uint256 totalRequiredAmount = _streamOutAmount + _poolConfig.poolOutSupplyAmount;
        if (!hasEnoughBalance(_outSupplyToken, address(this), totalRequiredAmount)) {
            revert InsufficientOutAmount();
        }

        // Validate that in token is a valid ERC20
        if (!isValidERC20(_inSupplyToken, msg.sender)) {
            revert InvalidInSupplyToken();
        }

        // Validate and set creator vesting info
        if (_creatorVestingInfo.isVestingEnabled) {
            // Validate vesting duration
            if (_creatorVestingInfo.vestingDuration == 0) {
                revert InvalidVestingDuration();
            }
            if (_creatorVestingInfo.cliffDuration == 0) {
                revert InvalidVestingCliffDuration();
            }
            if (_creatorVestingInfo.cliffDuration >= _creatorVestingInfo.vestingDuration) {
                revert InvalidVestingCliffDuration();
            }
            // set vesting info
            creatorVestingInfo = _creatorVestingInfo;
        }

        // Validate and set beneficiary vesting info
        if (_beneficiaryVestingInfo.isVestingEnabled) {
            // Validate vesting duration
            if (_beneficiaryVestingInfo.vestingDuration == 0) {
                revert InvalidVestingDuration();
            }
            if (_beneficiaryVestingInfo.cliffDuration == 0) {
                revert InvalidVestingCliffDuration();
            }
            if (_beneficiaryVestingInfo.cliffDuration >= _beneficiaryVestingInfo.vestingDuration) {
                revert InvalidVestingCliffDuration();
            }
            // set vesting info
            beneficiaryVestingInfo = _beneficiaryVestingInfo;
        }

        // Validate pool config
        if (_poolConfig.poolOutSupplyAmount > 0) {
            // Validate pool amount is less than or equal to out amount
            if (_poolConfig.poolOutSupplyAmount > _streamOutAmount) {
                revert InvalidAmount();
            }
            poolConfig = _poolConfig;
        }

        creator = _creator;
        positionStorage = new PositionStorage();
        positionStorageAddress = address(positionStorage);

        streamState = StreamTypes.StreamState({
            distIndex: DecimalMath.fromNumber(0),
            outRemaining: _streamOutAmount,
            inSupply: 0,
            spentIn: 0,
            shares: 0,
            currentStreamedPrice: DecimalMath.fromNumber(0),
            threshold: _threshold,
            outSupply: _streamOutAmount,
            lastUpdated: block.timestamp
        });

        streamTokens = StreamTypes.StreamTokens({ inSupplyToken: _inSupplyToken, outSupplyToken: _outSupplyToken });

        streamMetadata = StreamTypes.StreamMetadata({ name: _name });

        streamStatus = StreamTypes.Status.Waiting;

        streamTimes = StreamTypes.StreamTimes({
            bootstrappingStartTime: _bootstrappingStartTime,
            streamStartTime: _streamStartTime,
            streamEndTime: _streamEndTime
        });

        // Store the factory address
        streamFactoryAddress = msg.sender;
    }

    function syncStream(
        StreamTypes.StreamState memory state,
        StreamTypes.StreamTimes memory times,
        uint256 nowTime
    ) internal pure returns (StreamTypes.StreamState memory) {
        Decimal memory diff = StreamMathLib.calculateDiff(
            nowTime,
            times.streamStartTime,
            times.streamEndTime,
            state.lastUpdated
        );
        state.lastUpdated = nowTime;

        if (diff.value == 0) {
            return state;
        }

        StreamTypes.StreamState memory updatedState = StreamMathLib.calculateUpdatedState(state, diff);
        return updatedState;
    }

    function saveStreamState(StreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    function loadStreamState() internal view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    /**
     * @dev Validates if an operation is allowed based on the current stream status
     * @param allowedStatuses Array of allowed statuses for the operation
     */
    function isOperationAllowed(
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
     * @dev Safely transfers tokens from the contract to a recipient
     * @param tokenAddress Address of the token to transfer
     * @param recipient Address of the recipient
     * @param amount Amount of tokens to transfer
     * @return bool True if the transfer was successful
     */
    function safeTokenTransfer(address tokenAddress, address recipient, uint256 amount) internal returns (bool) {
        if (amount == 0 || recipient == address(0)) {
            return true;
        }

        IERC20 token = IERC20(tokenAddress);
        bool success = token.transfer(recipient, amount);
        if (!success) {
            revert PaymentFailed();
        }
        return true;
    }

    /**
     * @dev Checks if the threshold has been reached for stream finalization
     * @return bool True if the threshold has been reached, false otherwise
     */
    function isThresholdReached(StreamTypes.StreamState memory state) internal pure returns (bool) {
        return state.spentIn >= state.threshold;
    }

    /**
     * @dev Validates a position exists and is active
     * @param position The position to validate
     * @return bool True if the position is valid and active
     */
    function isValidActivePosition(PositionTypes.Position memory position) internal pure returns (bool) {
        return position.shares > 0 && position.exitDate == 0;
    }

    function withdraw(uint256 cap) external {
        assertAmountNotZero(cap);
        // Load position once
        PositionTypes.Position memory position = loadPosition(msg.sender);

        // Check if position is valid and active
        if (!isValidActivePosition(position)) {
            revert InvalidPosition();
        }

        // load stream times
        StreamTypes.StreamTimes memory times = loadStreamTimes();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](2);
        allowedStatuses[0] = StreamTypes.Status.Active;
        allowedStatuses[1] = StreamTypes.Status.Bootstrapping;
        isOperationAllowed(status, allowedStatuses);

        // Save the updated status
        saveStreamStatus(status);

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state, times, block.timestamp);

        // Sync position with the updated state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Check if withdrawal amount exceeds position balance
        if (cap > position.inBalance) {
            revert WithdrawAmountExceedsBalance(cap);
        }

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

        // Save everything at the end
        savePosition(msg.sender, position);
        saveStream(state);

        // Token transfer
        safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, cap);
        emit Withdrawn(address(this), msg.sender, position.inBalance, position.shares, state.inSupply, state.shares);
    }

    function subscribe(uint256 amountIn) external payable {
        assertAmountNotZero(amountIn);
        // Load status once
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        // Update the loaded status
        status = syncStreamStatus(status, times, block.timestamp);
        // Check if operation is allowed with the updated status
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](2);
        allowedStatuses[0] = StreamTypes.Status.Bootstrapping;
        allowedStatuses[1] = StreamTypes.Status.Active;
        isOperationAllowed(status, allowedStatuses);
        // Save the updated status
        saveStreamStatus(status);

        // Validate if sender has enough tokens
        IERC20 streamInToken = IERC20(streamTokens.inSupplyToken);
        uint256 streamInTokenBalance = streamInToken.balanceOf(msg.sender);
        if (streamInTokenBalance < amountIn) {
            revert InsufficientTokenPayment(amountIn, streamInTokenBalance);
        }

        // Transfer tokens from sender to this contract
        bool success = streamInToken.transferFrom(msg.sender, address(this), amountIn);
        if (!success) {
            revert PaymentFailed();
        }

        // Load position once
        PositionTypes.Position memory position = loadPosition(msg.sender);

        // Load stream state once
        StreamTypes.StreamState memory state = loadStream();

        // Update the stream state
        state = syncStream(state);

        uint256 newShares = 0;

        if (position.shares == 0) {
            // New position case
            newShares = StreamMathLib.computeSharesAmount(amountIn, false, state.inSupply, state.shares);
            position = PositionTypes.Position({
                inBalance: amountIn,
                shares: newShares,
                index: state.distIndex,
                lastUpdateTime: block.timestamp,
                pendingReward: DecimalMath.fromNumber(0),
                spentIn: 0,
                purchased: 0,
                exitDate: 0
            });
        } else {
            // Update existing position
            newShares = StreamMathLib.computeSharesAmount(amountIn, false, state.inSupply, state.shares);
            position = StreamMathLib.syncPosition(
                position,
                state.distIndex,
                state.shares,
                state.inSupply,
                block.timestamp
            );
            position.inBalance += amountIn;
            position.shares += newShares;
        }

        // Update StreamState
        state.inSupply += amountIn;
        state.shares += newShares;

        // Save everything once we're done modifying
        savePosition(msg.sender, position);
        saveStream(state);

        // Emit event
        emit Subscribed(address(this), msg.sender, amountIn, newShares, state.inSupply, state.shares);
    }

    function exitStream() external {
        // Load position
        PositionTypes.Position memory position = loadPosition(msg.sender);

        // Check if position is valid and active
        if (!isValidActivePosition(position)) {
            revert InvalidPosition();
        }

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
        handleExitDistribution(status, thresholdReached, position, beneficiaryVestingInfo);

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
                safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, position.inBalance);
            }
            if (vestingInfo.isVestingEnabled) {
                // Distribute earned output tokens
                uint256 amountToDistribute = position.purchased;
                // Load factory params
                StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
                StreamFactory.Params memory params = factoryContract.getParams();
                address vestingContractAddress = params.vestingAddress;
                IVesting vestingContract = IVesting(vestingContractAddress);
                // Create vesting schedule
                (uint256 cliffTime, uint256 endTime) = StreamMathLib.calculateVestingSchedule(
                    block.timestamp,
                    vestingInfo.cliffDuration,
                    vestingInfo.vestingDuration
                );
                // Transfer tokens to vesting contract
                safeTokenTransfer(streamTokens.outSupplyToken, vestingContractAddress, amountToDistribute);
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
                safeTokenTransfer(streamTokens.outSupplyToken, msg.sender, position.purchased);
            }
            emit ExitStreamed(address(this), msg.sender, position.purchased, position.spentIn, block.timestamp);
            return;
        }

        // Case 2: Refund scenario
        if (isRefundExit(status, thresholdReached)) {
            // Full refund of all input tokens (both spent and unspent)
            uint256 totalRefund = position.inBalance + position.spentIn;
            safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, totalRefund);
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
        assertIsCreator();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](1);
        allowedStatuses[0] = StreamTypes.Status.Ended;
        isOperationAllowed(status, allowedStatuses);

        // Load and update stream state
        StreamTypes.StreamState memory state = loadStream();
        state = syncStream(state, times, block.timestamp);

        bool thresholdReached = isThresholdReached(state);

        if (thresholdReached) {
            // Get fee collector from factory
            StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
            StreamFactory.Params memory params = factoryContract.getParams();
            address feeCollector = params.feeCollector;
            Decimal memory exitFeeRatio = params.exitFeeRatio;

            // Calculate exit fee
            (uint256 feeAmount, uint256 creatorRevenue) = StreamMathLib.calculateExitFee(state.spentIn, exitFeeRatio);

            // Transfer fee to fee collector if needed
            if (feeAmount > 0) {
                safeTokenTransfer(streamTokens.inSupplyToken, feeCollector, feeAmount);
            }

            // Handle pool creation if configured
            if (poolConfig.poolOutSupplyAmount > 0) {
                // Calculate pool ratio
                Decimal memory poolRatio = DecimalMath.div(
                    DecimalMath.fromNumber(poolConfig.poolOutSupplyAmount),
                    DecimalMath.fromNumber(streamState.outSupply)
                );

                // Calculate pool amount based on ratio
                uint256 totalRevenue = state.spentIn - feeAmount;
                uint256 decimalTotalRevenue = DecimalMath.fromNumber(totalRevenue).value;

                Decimal memory decimalPoolInSupplyAmount = DecimalMath.mul(
                    DecimalMath.fromNumber(decimalTotalRevenue),
                    poolRatio
                );
                uint256 poolInSupplyAmount = DecimalMath.floor(decimalPoolInSupplyAmount);
                uint256 creatorAmount = totalRevenue - poolInSupplyAmount;
                // Create pool and add liquidity
                createPoolAndAddLiquidity(
                    streamTokens.inSupplyToken,
                    streamTokens.outSupplyToken,
                    poolInSupplyAmount,
                    poolConfig.poolOutSupplyAmount
                );
                // Send revenue to creator
                safeTokenTransfer(streamTokens.inSupplyToken, creator, creatorAmount);
            } else {
                // Send revenue to creator
                safeTokenTransfer(streamTokens.inSupplyToken, creator, creatorRevenue);
            }

            // Update status
            status = StreamTypes.Status.FinalizedStreamed;

            // Refund out tokens to creator if left any
            if (state.outRemaining > 0) {
                safeTokenTransfer(streamTokens.outSupplyToken, creator, state.outRemaining);
            }

            emit FinalizedStreamed(address(this), creator, creatorRevenue, feeAmount, state.outRemaining, status);
        } else {
            // Update status
            status = StreamTypes.Status.FinalizedRefunded;

            // Refund out tokens to creator
            safeTokenTransfer(streamTokens.outSupplyToken, creator, state.outSupply);

            emit FinalizedRefunded(address(this), creator, state.outSupply, status);
        }

        // Save everything
        saveStreamStatus(status);
        saveStream(state);
    }

    function syncStreamExternal() external {
        // Load, update and save stream state
        StreamTypes.StreamState memory state = loadStream();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        state = syncStream(state, times, block.timestamp);
        saveStream(state);

        // Load, update and save status
        StreamTypes.Status status = loadStreamStatus();
        status = syncStreamStatus(status, times, block.timestamp);
        saveStreamStatus(status);

        emit StreamSynced(
            address(this),
            state.lastUpdated,
            uint8(status),
            state.distIndex,
            state.outRemaining,
            state.inSupply,
            state.spentIn,
            state.currentStreamedPrice
        );
    }

    function syncPosition(address user) external {
        PositionTypes.Position memory position = loadPosition(user);
        StreamTypes.StreamState memory state = loadStream();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        state = syncStream(state, times, block.timestamp);
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);
        savePosition(user, position);
        saveStream(state);
        emit PositionSynced(address(this), user, position.inBalance, position.shares);
    }

    function cancelStream() external {
        assertIsCreator();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](1);
        allowedStatuses[0] = StreamTypes.Status.Waiting;
        isOperationAllowed(status, allowedStatuses);

        // Refund out tokens to creator
        safeTokenTransfer(streamTokens.outSupplyToken, creator, streamState.outSupply);

        // Update status
        status = StreamTypes.Status.Cancelled;
        saveStreamStatus(status);

        emit StreamCancelled(address(this), creator, streamState.outSupply, status);
    }

    function cancelWithAdmin() external {
        assertIsProtocolAdmin();

        // Load and update status
        StreamTypes.Status status = loadStreamStatus();
        StreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        StreamTypes.Status[] memory allowedStatuses = new StreamTypes.Status[](3);
        allowedStatuses[0] = StreamTypes.Status.Waiting;
        allowedStatuses[1] = StreamTypes.Status.Bootstrapping;
        allowedStatuses[2] = StreamTypes.Status.Active;
        isOperationAllowed(status, allowedStatuses);

        // Refund out tokens to creator
        safeTokenTransfer(streamTokens.outSupplyToken, creator, streamState.outSupply);

        // Update status
        status = StreamTypes.Status.Cancelled;
        saveStreamStatus(status);

        emit StreamCancelled(address(this), creator, streamState.outSupply, status);
    }

    /**
     * @dev Checks if an address is a valid ERC20 token
     * @param tokenAddress The token address to validate
     * @param testAccount The account to use for testing the token interface
     * @return isValid True if the address implements the ERC20 interface
     */
    function isValidERC20(address tokenAddress, address testAccount) internal view returns (bool isValid) {
        if (tokenAddress == address(0)) {
            return false;
        }

        try IERC20(tokenAddress).balanceOf(testAccount) returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Checks if an account has sufficient token balance
     * @param tokenAddress The ERC20 token address
     * @param account The account to check balance for
     * @param requiredAmount The minimum required balance
     * @return hasEnoughBalance True if the account has sufficient balance
     */
    function hasEnoughBalance(
        address tokenAddress,
        address account,
        uint256 requiredAmount
    ) internal view returns (bool) {
        try IERC20(tokenAddress).balanceOf(account) returns (uint256 balance) {
            return balance >= requiredAmount;
        } catch Error(string memory) {
            return false;
        } catch {
            return false;
        }
    }

    // Load helpers
    function loadStream() internal view returns (StreamTypes.StreamState memory) {
        return streamState;
    }

    function loadStreamStatus() internal view returns (StreamTypes.Status) {
        return streamStatus;
    }

    function loadPosition(address user) internal view returns (PositionTypes.Position memory) {
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
        positionStorage.updatePosition(user, position);
    }

    // Refactored syncStream to work directly with a provided memory object
    function syncStream(StreamTypes.StreamState memory state) internal view returns (StreamTypes.StreamState memory) {
        StreamTypes.StreamTimes memory times = loadStreamTimes();

        Decimal memory diff = StreamMathLib.calculateDiff(
            block.timestamp,
            times.streamStartTime,
            times.streamEndTime,
            state.lastUpdated
        );

        if (diff.value > 0) {
            state = StreamMathLib.calculateUpdatedState(state, diff);
            state.lastUpdated = block.timestamp;
        }

        return state;
    }

    function createPoolAndAddLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal {
        StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
        StreamFactory.Params memory params = factoryContract.getParams();

        address uniswapV2FactoryAddress = params.uniswapV2FactoryAddress;
        address uniswapV2RouterAddress = params.uniswapV2RouterAddress;

        IUniswapV2Factory factory = IUniswapV2Factory(uniswapV2FactoryAddress);
        IUniswapV2Router02 router = IUniswapV2Router02(uniswapV2RouterAddress);

        // Check if the pair exists; if not, create it
        address pair = factory.getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
        }

        // Approve tokens to the router
        IERC20(tokenA).approve(address(router), amountADesired);
        IERC20(tokenB).approve(address(router), amountBDesired);

        // Add liquidity to the pool
        router.addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            1, // Slippage tolerance can be adjusted
            1,
            address(this), // LP tokens are sent to the contract
            block.timestamp
        );
    }

    // Refactored syncStreamStatus to work directly with a provided memory object
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
     * @dev Ensure value is non-zero
     * @param value The value to check
     * @param errorMessage The error message to revert with
     */
    function assertNonZero(uint256 value, string memory errorMessage) internal pure {
        if (value == 0) revert(errorMessage);
    }

    /**
     * @dev Ensure sender is the creator
     */
    function assertIsCreator() internal view {
        if (msg.sender != creator) revert Unauthorized();
    }

    /**
     * @dev Ensure sender is the protocol admin
     */
    function assertIsProtocolAdmin() internal view {
        StreamFactory factoryContract = StreamFactory(streamFactoryAddress);
        address protocolAdmin = factoryContract.getParams().protocolAdmin;
        if (msg.sender != protocolAdmin) revert Unauthorized();
    }

    /**
     * @dev Ensure status matches expected value
     * @param status Current status to check
     * @param expectedStatus Status that is expected
     */
    function assertStatus(StreamTypes.Status status, StreamTypes.Status expectedStatus) internal pure {
        if (status != expectedStatus) revert OperationNotAllowed();
    }

    /**
     * @dev Ensure amount is not zero
     * @param amount Amount to check
     */
    function assertAmountNotZero(uint256 amount) internal pure {
        if (amount == 0) revert InvalidAmount();
    }

    /**
     * @dev Assert that the cap does not exceed balance
     * @param cap Amount to withdraw
     * @param balance Available balance
     */
    function assertWithinBalance(uint256 cap, uint256 balance) internal pure {
        if (cap > balance) revert WithdrawAmountExceedsBalance(cap);
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
        return positionStorage.getPosition(user);
    }
}
