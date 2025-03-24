// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./PositionStorage.sol";
import "./PositionTypes.sol";
import "./StreamEvents.sol";
import "./StreamErrors.sol";
import "./StreamTypes.sol";
import "./StreamFactory.sol";
import "./DecimalMath.sol";
import "./StreamMathLib.sol";

import "hardhat/console.sol";

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);
}

contract Stream is IStreamErrors, IStreamEvents {
    address public creator;
    address public positionStorageAddress;
    string public name;

    IStreamTypes.StreamState public streamState;
    IStreamTypes.StreamTokens public streamTokens;
    IStreamTypes.StreamMetadata public streamMetadata;
    IStreamTypes.Status public streamStatus;
    IStreamTypes.StreamTimes public streamTimes;
    address public factory;

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
        address _creator
    ) {
        // Validate that output token is a valid ERC20
        if (!isValidERC20(_outSupplyToken, msg.sender)) {
            revert InvalidOutSupplyToken();
        }

        // Check if the contract has enough balance of output token
        if (!hasEnoughBalance(_outSupplyToken, address(this), _streamOutAmount)) {
            revert InsufficientOutAmount();
        }

        // Validate that in token is a valid ERC20
        if (!isValidERC20(_inSupplyToken, msg.sender)) {
            revert InvalidInSupplyToken();
        }

        creator = _creator;
        positionStorage = new PositionStorage();
        positionStorageAddress = address(positionStorage);

        streamState = IStreamTypes.StreamState({
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

        streamTokens = IStreamTypes.StreamTokens({ inSupplyToken: _inSupplyToken, outSupplyToken: _outSupplyToken });

        streamMetadata = IStreamTypes.StreamMetadata({ name: _name });

        streamStatus = IStreamTypes.Status.Waiting;

        streamTimes = IStreamTypes.StreamTimes({
            bootstrappingStartTime: _bootstrappingStartTime,
            streamStartTime: _streamStartTime,
            streamEndTime: _streamEndTime
        });

        // Store the factory address
        factory = msg.sender;
    }

    function syncStream(
        IStreamTypes.StreamState memory state,
        IStreamTypes.StreamTimes memory times,
        uint256 nowTime
    ) internal pure returns (IStreamTypes.StreamState memory) {
        uint256 diff = StreamMathLib.calculateDiff(
            nowTime,
            times.streamStartTime,
            times.streamEndTime,
            state.lastUpdated
        );

        if (diff > 0) {
            IStreamTypes.StreamState memory updatedState = StreamMathLib.calculateUpdatedState(state, diff);
            return updatedState;
        }

        return state;
    }

    function saveStreamState(IStreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    function loadStreamState() internal view returns (IStreamTypes.StreamState memory) {
        return streamState;
    }

    /**
     * @dev Validates if an operation is allowed based on the current stream status
     * @param allowedStatuses Array of allowed statuses for the operation
     * @return bool True if the operation is allowed, false otherwise
     */
    function isOperationAllowed(
        IStreamTypes.Status currentStatus,
        IStreamTypes.Status[] memory allowedStatuses
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < allowedStatuses.length; i++) {
            if (currentStatus == allowedStatuses[i]) {
                return true;
            }
        }
        return false;
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
    function isThresholdReached(IStreamTypes.StreamState memory state) internal pure returns (bool) {
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
        if (cap == 0) {
            revert InvalidWithdrawAmount();
        }

        // Load position once
        PositionTypes.Position memory position = loadPosition(msg.sender);
        if (position.shares == 0) {
            revert OperationNotAllowed();
        }

        if (cap > position.inBalance) {
            revert WithdrawAmountExceedsBalance(cap);
        }

        // load stream times
        IStreamTypes.StreamTimes memory times = loadStreamTimes();

        // Load and update status
        IStreamTypes.Status status = loadStreamStatus();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        IStreamTypes.Status[] memory allowedStatuses = new IStreamTypes.Status[](2);
        allowedStatuses[0] = IStreamTypes.Status.Active;
        allowedStatuses[1] = IStreamTypes.Status.Bootstrapping;
        isOperationAllowed(status, allowedStatuses);

        // Save the updated status
        saveStreamStatus(status);

        // Load and update stream state
        IStreamTypes.StreamState memory state = loadStream();
        state = syncStream(state, times, block.timestamp);

        // Sync position with the updated state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        if (cap == position.inBalance) {
            position.shares = 0;
            position.inBalance = 0;
        } else {
            position.shares =
                position.shares -
                StreamMathLib.computeSharesAmount(cap, true, state.inSupply, position.shares);
            position.inBalance = position.inBalance - cap;
        }

        // Update stream state
        state.inSupply = state.inSupply - cap;
        state.shares = state.shares - StreamMathLib.computeSharesAmount(cap, true, state.inSupply, state.shares);

        // Save everything at the end
        savePosition(msg.sender, position);
        saveStream(state);

        // Token transfer
        safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, cap);
        emit Withdrawn(address(this), msg.sender, position.inBalance, position.shares, state.inSupply, state.shares);
    }

    function subscribe(uint256 amountIn) external payable {
        // Load status once
        IStreamTypes.Status status = loadStreamStatus();
        IStreamTypes.StreamTimes memory times = loadStreamTimes();
        // Update the loaded status
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed with the updated status
        IStreamTypes.Status[] memory allowedStatuses = new IStreamTypes.Status[](2);
        allowedStatuses[0] = IStreamTypes.Status.Bootstrapping;
        allowedStatuses[1] = IStreamTypes.Status.Active;
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
        IStreamTypes.StreamState memory state = loadStream();

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
            revert OperationNotAllowed();
        }

        // Load and update stream state
        IStreamTypes.StreamState memory state = loadStream();
        state = syncStream(state);

        // Sync position with updated state
        position = StreamMathLib.syncPosition(position, state.distIndex, state.shares, state.inSupply, block.timestamp);

        // Load and update status
        IStreamTypes.Status status = loadStreamStatus();
        IStreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        bool thresholdReached = isThresholdReached(state);

        if (
            (status == IStreamTypes.Status.Ended && thresholdReached) ||
            (status == IStreamTypes.Status.FinalizedStreamed)
        ) {
            // Normal exit
            // Refund in_amount remaining if any in position
            if (position.inBalance > 0) {
                safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, position.inBalance);
            }
            // send out_amount earned to position owner
            safeTokenTransfer(streamTokens.outSupplyToken, msg.sender, position.purchased);
        } else {
            // Refund total in_amount
            uint256 total_amount = position.inBalance + position.spentIn;
            safeTokenTransfer(streamTokens.inSupplyToken, msg.sender, total_amount);
        }

        // Set exit date
        position.exitDate = block.timestamp;

        // Save everything
        saveStreamStatus(status);
        saveStream(state);
        savePosition(msg.sender, position);

        emit Exited(address(this), msg.sender, position.purchased, position.spentIn, block.timestamp);
    }

    function finalizeStream() external {
        assertIsCreator();

        // Load and update status
        IStreamTypes.Status status = loadStreamStatus();
        IStreamTypes.StreamTimes memory times = loadStreamTimes();
        status = syncStreamStatus(status, times, block.timestamp);

        // Check if operation is allowed
        IStreamTypes.Status[] memory allowedStatuses = new IStreamTypes.Status[](1);
        allowedStatuses[0] = IStreamTypes.Status.Ended;
        isOperationAllowed(status, allowedStatuses);

        // Load and update stream state
        IStreamTypes.StreamState memory state = loadStream();
        state = syncStream(state, times, block.timestamp);

        bool thresholdReached = isThresholdReached(state);

        if (thresholdReached) {
            // Get fee collector from factory
            StreamFactory factoryContract = StreamFactory(factory);
            StreamFactory.Params memory params = factoryContract.getParams();
            address feeCollector = params.feeCollector;
            Decimal memory exitFeeRatio = params.exitFeeRatio;

            // Calculate exit fee
            (uint256 feeAmount, uint256 creatorRevenue) = StreamMathLib.calculateExitFee(state.spentIn, exitFeeRatio);

            // Transfer fee to fee collector if needed
            if (feeAmount > 0) {
                safeTokenTransfer(streamTokens.inSupplyToken, feeCollector, feeAmount);
            }

            // Send revenue to creator
            safeTokenTransfer(streamTokens.inSupplyToken, creator, creatorRevenue);

            // Update status
            status = IStreamTypes.Status.FinalizedStreamed;

            // Refund out tokens to creator if left any
            if (state.outRemaining > 0) {
                safeTokenTransfer(streamTokens.outSupplyToken, creator, state.outRemaining);
            }
        } else {
            // Update status
            status = IStreamTypes.Status.FinalizedRefunded;

            // Refund out tokens to creator
            safeTokenTransfer(streamTokens.outSupplyToken, creator, state.outSupply);
        }

        // Save everything
        saveStreamStatus(status);
        saveStream(state);

        emit StreamFinalized(address(this), creator, state.spentIn, state.outRemaining, status);
    }

    function syncStreamExternal() external {
        // Load, update and save stream state
        IStreamTypes.StreamState memory state = loadStream();
        IStreamTypes.StreamTimes memory times = loadStreamTimes();
        state = syncStream(state, times, block.timestamp);
        saveStream(state);

        // Load, update and save status
        IStreamTypes.Status status = loadStreamStatus();
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
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(account);
        return balance >= requiredAmount;
    }

    // Load helpers
    function loadStream() internal view returns (IStreamTypes.StreamState memory) {
        return streamState;
    }

    function loadStreamStatus() internal view returns (IStreamTypes.Status) {
        return streamStatus;
    }

    function loadPosition(address user) internal view returns (PositionTypes.Position memory) {
        return positionStorage.getPosition(user);
    }

    function loadStreamTimes() internal view returns (IStreamTypes.StreamTimes memory) {
        return streamTimes;
    }

    // Save helpers
    function saveStream(IStreamTypes.StreamState memory state) internal {
        streamState = state;
    }

    function saveStreamStatus(IStreamTypes.Status status) internal {
        streamStatus = status;
    }

    function savePosition(address user, PositionTypes.Position memory position) internal {
        positionStorage.updatePosition(user, position);
    }

    // Refactored syncStream to work directly with a provided memory object
    function syncStream(IStreamTypes.StreamState memory state) internal view returns (IStreamTypes.StreamState memory) {
        IStreamTypes.StreamTimes memory times = loadStreamTimes();

        uint256 diff = StreamMathLib.calculateDiff(
            block.timestamp,
            times.streamStartTime,
            times.streamEndTime,
            state.lastUpdated
        );

        if (diff > 0) {
            state = StreamMathLib.calculateUpdatedState(state, diff);
            state.lastUpdated = block.timestamp;
        }

        return state;
    }

    // Refactored syncStreamStatus to work directly with a provided memory object
    function syncStreamStatus(
        IStreamTypes.Status status,
        IStreamTypes.StreamTimes memory times,
        uint256 nowTime
    ) internal pure returns (IStreamTypes.Status) {
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
     * @dev Ensure status matches expected value
     * @param status Current status to check
     * @param expectedStatus Status that is expected
     */
    function assertStatus(IStreamTypes.Status status, IStreamTypes.Status expectedStatus) internal pure {
        if (status != expectedStatus) revert OperationNotAllowed();
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
    function getStreamStatus() external view returns (IStreamTypes.Status) {
        return streamStatus;
    }
}
