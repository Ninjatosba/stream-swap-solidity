// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./PositionStorage.sol";
import "./PositionTypes.sol";
import "./StreamEvents.sol";
import "./StreamErrors.sol";
import "./StreamTypes.sol";
import "./StreamFactory.sol";
import "./DecimalMath.sol";

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
    uint256 private constant MIN_WAITING_DURATION = 10 seconds;
    uint256 private constant MIN_BOOTSTRAPPING_DURATION = 10 seconds;
    uint256 private constant MIN_STREAM_DURATION = 50 seconds;

    IERC20 public token;
    IStreamTypes.StreamState public streamState;
    IStreamTypes.StreamMetadata public streamMetadata;
    IStreamTypes.StatusInfo public streamStatus;
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
        validateStreamTimes(block.timestamp, _bootstrappingStartTime, _streamStartTime, _streamEndTime);

        // Validate that output token is a valid ERC20
        if (!isValidERC20(_outSupplyToken, msg.sender)) {
            revert InvalidOutSupplyToken();
        }
        
        // Check if the contract has sufficient balance of output token
        if (!hasSufficientBalance(_outSupplyToken, address(this), _streamOutAmount)) {
            revert InsufficientOutAmount();
        }
        
        // Validate that in token is a valid ERC20
        if (!isValidERC20(_inSupplyToken, msg.sender)) {
            revert InvalidInSupplyToken();
        }
        
        creator = _creator;
        positionStorage = new PositionStorage();
        positionStorageAddress = address(positionStorage);
        
        // Set token (assuming this is for inSupplyToken)
        token = IERC20(_inSupplyToken);
        
        streamState = IStreamTypes.StreamState({
            distIndex: 0,
            outRemaining: _streamOutAmount,
            inSupplyToken: _inSupplyToken,
            outSupplyToken: _outSupplyToken,
            inSupply: 0,
            spentIn: 0,
            shares: 0,
            currentStreamedPrice: 0,
            threshold: _threshold,
            outSupply: _streamOutAmount
        });

        streamMetadata = IStreamTypes.StreamMetadata({
            name: _name
        });

        streamStatus = IStreamTypes.StatusInfo({
            mainStatus: IStreamTypes.Status.Waiting,
            finalized: IStreamTypes.FinalizedStatus.None,
            lastUpdated: block.timestamp,
            bootstrappingStartTime: _bootstrappingStartTime,
            streamStartTime: _streamStartTime,
            streamEndTime: _streamEndTime
        });

        // Store the factory address
        factory = msg.sender;
    }

    function validateStreamTimes(
        uint256 nowTime,
        uint256 _bootstrappingStartTime,
        uint256 _startTime,
        uint256 _endTime
    ) internal pure {
        if (nowTime > _bootstrappingStartTime) revert InvalidBootstrappingStartTime();
        if (_bootstrappingStartTime > _startTime) revert InvalidStreamStartTime();
        if (_startTime > _endTime) revert InvalidStreamEndTime();
        if (_endTime - _startTime < MIN_STREAM_DURATION) revert StreamDurationTooShort();
        if (_startTime - _bootstrappingStartTime < MIN_BOOTSTRAPPING_DURATION) revert BootstrappingDurationTooShort();
        if (_bootstrappingStartTime - nowTime < MIN_WAITING_DURATION) revert WaitingDurationTooShort();
    }

    function calculateDiff() internal view returns (uint256) {
        // If the stream is not started yet or already ended, return 0
        if (block.timestamp < streamStatus.streamStartTime || streamStatus.lastUpdated >= streamStatus.streamEndTime) {
            return 0;
        }

        // If lastUpdated is before start time, set it to start time
        uint256 effectiveLastUpdated = streamStatus.lastUpdated;
        if (effectiveLastUpdated < streamStatus.streamStartTime) {
            effectiveLastUpdated = streamStatus.streamStartTime;
        }

        // If current time is past end time, use end time instead
        uint256 effectiveNow = block.timestamp;
        if (effectiveNow > streamStatus.streamEndTime) {
            effectiveNow = streamStatus.streamEndTime;
        }

        uint256 numerator = effectiveNow - effectiveLastUpdated;
        uint256 denominator = streamStatus.streamEndTime - effectiveLastUpdated;

        if (denominator == 0 || numerator == 0) {
            return 0;
        }
        // Return ratio of time elapsed since last update compared to total remaining time
        return (numerator * 1e18) / denominator;
    }

    function syncStreamStatus() internal {
        // Don't update if stream is in a final state
        if (streamStatus.mainStatus == IStreamTypes.Status.Cancelled ||
            (streamStatus.mainStatus == IStreamTypes.Status.Finalized && 
            (streamStatus.finalized == IStreamTypes.FinalizedStatus.Streamed || 
             streamStatus.finalized == IStreamTypes.FinalizedStatus.Refunded))) {
            return;
        }

        // Update status based on current timestamp
        if (block.timestamp < streamStatus.bootstrappingStartTime) {
            streamStatus.mainStatus = IStreamTypes.Status.Waiting;
        } 
        else if (block.timestamp >= streamStatus.bootstrappingStartTime && 
                 block.timestamp < streamStatus.streamStartTime) {
            streamStatus.mainStatus = IStreamTypes.Status.Bootstrapping;
        }
        else if (block.timestamp >= streamStatus.streamStartTime && 
                 block.timestamp < streamStatus.streamEndTime) {
            streamStatus.mainStatus = IStreamTypes.Status.Active;
        }
        else if (block.timestamp >= streamStatus.streamEndTime) {
            streamStatus.mainStatus = IStreamTypes.Status.Ended;
        }
    }

    function computeSharesAmount(uint256 amountIn, bool roundUp) internal view returns (uint256) {
        if (streamState.shares == 0 || amountIn == 0) {
            return amountIn;
        }
        
        uint256 shares = streamState.shares * amountIn;
        if (roundUp) {
            return (shares + streamState.inSupply - 1) / streamState.inSupply;
        } else {
            return shares / streamState.inSupply;
        }
    }

    function syncStream() internal {
        uint256 diff = calculateDiff();

        if (streamState.shares > 0 && diff > 0) {
            // Calculate new distribution balance and spent in amount
            uint256 newDistributionBalance = (streamState.outRemaining * diff) / 1e18;
            uint256 spentIn = (streamState.inSupply * diff) / 1e18;

            // Update state variables
            streamState.spentIn += spentIn;
            streamState.inSupply -= spentIn;

            if (newDistributionBalance > 0) {
                streamState.outRemaining -= newDistributionBalance;
                // Update distribution index (shares are in base units, multiply by 1e18 for precision)
                streamState.distIndex += (newDistributionBalance * 1e18) / streamState.shares;
                // Update current streamed price
                streamState.currentStreamedPrice = (spentIn * 1e18) / newDistributionBalance;
            }
        }

        streamStatus.lastUpdated = block.timestamp;
    }

    /**
     * @dev Validates if an operation is allowed based on the current stream status
     * @param allowedStatuses Array of allowed statuses for the operation
     * @return bool True if the operation is allowed, false otherwise
     */
    function isOperationAllowed(IStreamTypes.Status[] memory allowedStatuses) internal view returns (bool) {
        for (uint256 i = 0; i < allowedStatuses.length; i++) {
            if (streamStatus.mainStatus == allowedStatuses[i]) {
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
     * @dev Calculates the exit fee amount based on the spent in amount
     * @param spentInAmount Amount of tokens spent in the stream
     * @return feeAmount The calculated fee amount
     * @return remainingAmount The remaining amount after fee deduction
     */
    function calculateExitFee(uint256 spentInAmount) internal view returns (uint256 feeAmount, uint256 remainingAmount) {
        StreamFactory factoryContract = StreamFactory(factory);
        StreamFactory.Params memory params = factoryContract.getParams();
        uint256 decimalExitFee = params.exitFeePercent;
        
        // Calculate exit fee amount using DecimalMath
        uint256 decimalSpentIn = DecimalMath.fromNumber(spentInAmount);
        uint256 exitFeeAmount = DecimalMath.mul(decimalSpentIn, decimalExitFee);
        feeAmount = DecimalMath.floor(exitFeeAmount);
        remainingAmount = spentInAmount - feeAmount;
        
        return (feeAmount, remainingAmount);
    }

    /**
     * @dev Checks if the threshold has been reached for stream finalization
     * @return bool True if the threshold has been reached, false otherwise
     */
    function isThresholdReached() internal view returns (bool) {
        return streamState.spentIn >= streamState.threshold;
    }

    /**
     * @dev Validates a position exists and is active
     * @param position The position to validate
     * @return bool True if the position is valid and active
     */
    function isValidActivePosition(PositionTypes.Position memory position) internal pure returns (bool) {
        return position.shares > 0 && position.exitDate == 0;
    }

    function syncPosition(
        PositionTypes.Position memory position,
        uint256 distIndex,
        uint256 shares,
        uint256 inSupply,
        uint256 nowTime

    ) internal pure returns (PositionTypes.Position memory) {
        // Create a new position in memory to store the updated values
        PositionTypes.Position memory updatedPosition = PositionTypes.Position({
            inBalance: position.inBalance,
            shares: position.shares,
            index: position.index,
            lastUpdateTime: position.lastUpdateTime,
            pendingReward: position.pendingReward,
            spentIn: position.spentIn,
            purchased: position.purchased,
            exitDate: position.exitDate
        });

        // Calculate index difference for distributions since last update
        uint256 indexDiff = distIndex - updatedPosition.index;
        uint256 spent = 0;
        uint256 purchased = 0;

        // Only process if there are shares in the stream
        if (shares > 0) {
            // Calculate purchased amount based on position shares and index difference
            uint256 positionPurchased = (updatedPosition.shares * indexDiff) / 1e18 + updatedPosition.pendingReward;
            // Calculate remaining balance based on current shares ratio
            uint256 inRemaining = (inSupply * updatedPosition.shares) / shares;
            // Calculate spent amount
            spent = updatedPosition.inBalance - inRemaining;
            updatedPosition.spentIn += spent;
            updatedPosition.inBalance = inRemaining;

            // Update purchased amount
            purchased = positionPurchased;
            updatedPosition.purchased += purchased;
        }

        // Update position tracking
        updatedPosition.index = distIndex;
        updatedPosition.lastUpdateTime = nowTime;

        return updatedPosition;
    }

    function withdraw(uint256 cap) external {
        if (cap == 0) {
            revert InvalidWithdrawAmount();
        }
        PositionTypes.Position memory position = positionStorage.getPosition(msg.sender);
        if (position.shares == 0) {
            revert OperationNotAllowed();
        }

        if (cap > position.inBalance) {
            revert WithdrawAmountExceedsBalance(cap);
        }

        syncStreamStatus();
        
        // Use the new internal function to check if operation is allowed
        IStreamTypes.Status[] memory allowedStatuses = new IStreamTypes.Status[](2);
        allowedStatuses[0] = IStreamTypes.Status.Active;
        allowedStatuses[1] = IStreamTypes.Status.Bootstrapping;
        if (!isOperationAllowed(allowedStatuses)) {
            revert OperationNotAllowed();
        }

        syncStream();
        position = syncPosition(position, streamState.distIndex, streamState.shares, streamState.inSupply, block.timestamp);

        if (cap == position.inBalance) {
            position.shares = 0;
            position.inBalance = 0;
        } else {
            position.shares = position.shares - computeSharesAmount(cap, true);
            position.inBalance = position.inBalance - cap;
        }

        positionStorage.updatePosition(msg.sender, position);
        streamState.inSupply = streamState.inSupply - cap;
        streamState.shares = streamState.shares - computeSharesAmount(cap, true);
        
        // Use the new safeTokenTransfer function
        safeTokenTransfer(streamState.inSupplyToken, msg.sender, cap);
        emit Withdrawn(msg.sender, cap);
    }

    function subscribe(uint256 amountIn) external payable {
        // Get current status
        syncStreamStatus();
        
        // Use the new internal function to check if operation is allowed
        IStreamTypes.Status[] memory allowedStatuses = new IStreamTypes.Status[](2);
        allowedStatuses[0] = IStreamTypes.Status.Bootstrapping;
        allowedStatuses[1] = IStreamTypes.Status.Active;
        if (!isOperationAllowed(allowedStatuses)) {
            revert OperationNotAllowed();
        }
        
        // Validate if sender has enough tokens
        IERC20 streamInToken = IERC20(streamState.inSupplyToken);
        uint256 streamInTokenBalance = streamInToken.balanceOf(msg.sender);
        if (streamInTokenBalance < amountIn) {
            revert InsufficientTokenPayment(amountIn, streamInTokenBalance);
        }
        // Transfer tokens from sender to this contract
        bool success = streamInToken.transferFrom(msg.sender, address(this), amountIn);
        if (!success) {
            revert PaymentFailed();
        }

        // Query position from PositionStorage contract
        PositionTypes.Position memory position = positionStorage.getPosition(msg.sender);
        uint256 newShares = 0;

        if (position.shares == 0) {
            // New position case
            // First sync the stream to ensure new tokens don't participate in previous distribution
            syncStream();

            // Calculate new shares (we'll implement this next)
            newShares = computeSharesAmount(amountIn, false);
            positionStorage.createPosition(msg.sender, amountIn, newShares, streamState.distIndex);
        }
        else {
            // Sync stream to ensure new tokens don't participate in previous distribution
            syncStream();
            // Calculate new shares (we'll implement this next)
            newShares = computeSharesAmount(amountIn, false);
            position = syncPosition(position, streamState.distIndex, streamState.shares, streamState.inSupply, block.timestamp);
            position.inBalance += amountIn;
            position.shares += newShares;
            // Save position to PositionStorage contract
            positionStorage.updatePosition(msg.sender, position);
        }

        // Update StreamState
        streamState.inSupply += amountIn;
        streamState.shares += newShares;

        // Emit event
        emit Subscribed(msg.sender, amountIn, newShares);
    }

    function exitStream() external {
        PositionTypes.Position memory position = positionStorage.getPosition(msg.sender);
        
        // Use the new isValidActivePosition function
        if (!isValidActivePosition(position)) {
            revert OperationNotAllowed();
        }
        
        // Sync stream
        syncStream();
        // Sync position
        position = syncPosition(position, streamState.distIndex, streamState.shares, streamState.inSupply, block.timestamp);
        // Check status
        syncStreamStatus();

        // Use the new isThresholdReached function
        if (streamStatus.mainStatus == IStreamTypes.Status.Ended && isThresholdReached() || 
            streamStatus.mainStatus == IStreamTypes.Status.Finalized && streamStatus.finalized == IStreamTypes.FinalizedStatus.Streamed) {
            // Normal exit
            // Refund in_amount remaining if any in position
            if (position.inBalance > 0) {
                // Use the new safeTokenTransfer function
                safeTokenTransfer(streamState.inSupplyToken, msg.sender, position.inBalance);
            }
            // send out_amount earned to position owner
            safeTokenTransfer(streamState.outSupplyToken, msg.sender, position.purchased);
        }
        else {
            // Refund total in_amount
            uint256 total_amount = position.inBalance + position.spentIn;
            // Use the new safeTokenTransfer function
            safeTokenTransfer(streamState.inSupplyToken, msg.sender, total_amount);
        }
        // Set exit date
        positionStorage.setExitDate(msg.sender, block.timestamp);
        emit Exited(msg.sender, position.purchased);
        positionStorage.updatePosition(msg.sender, position);
    }

    function finalizeStream() external {
        // Check is sender is the creator
        if (msg.sender != creator) {
            revert Unauthorized();
        }
        // Check status
        syncStreamStatus();
        // Finalize is only allowed if stream is ended 
        if (streamStatus.mainStatus != IStreamTypes.Status.Ended) {
            revert OperationNotAllowed();
        }
        // Sync stream
        syncStream();

        // Use the new isThresholdReached function
        if (isThresholdReached()) {
            // Get fee collector from factory
            StreamFactory factoryContract = StreamFactory(factory);
            StreamFactory.Params memory params = factoryContract.getParams();
            address feeCollector = params.feeCollector;

            // Use the new calculateExitFee function
            (uint256 feeAmount, uint256 creatorRevenue) = calculateExitFee(streamState.spentIn);
            
            // Transfer fee to fee collector if needed
            if (feeAmount > 0) {
                safeTokenTransfer(streamState.inSupplyToken, feeCollector, feeAmount);
            }

            // Send revenue to creator
            safeTokenTransfer(streamState.inSupplyToken, creator, creatorRevenue);

            streamStatus.finalized = IStreamTypes.FinalizedStatus.Streamed;
            streamStatus.mainStatus = IStreamTypes.Status.Finalized;

            // Refund out tokens to creator if left any
            if (streamState.outRemaining > 0) {
                safeTokenTransfer(streamState.outSupplyToken, creator, streamState.outRemaining);
            }
        }
        else {
            streamStatus.finalized = IStreamTypes.FinalizedStatus.Refunded;
            streamStatus.mainStatus = IStreamTypes.Status.Finalized;
            // Refund out tokens to creator
            safeTokenTransfer(streamState.outSupplyToken, creator, streamState.outSupply);
        }

        emit StreamFinalized(creator, streamState.spentIn, streamState.outRemaining, streamStatus.finalized);
    }

    function syncStreamExternal() external {
        syncStream();
        syncStreamStatus();
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
     * @return hasSufficientBalance True if the account has sufficient balance
     */
    function hasSufficientBalance(
        address tokenAddress,
        address account,
        uint256 requiredAmount
    ) internal view returns (bool hasSufficientBalance) {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(account);
        return balance >= requiredAmount;
    }
}



