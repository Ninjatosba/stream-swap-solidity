// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./PositionStorage.sol";
import "./PositionTypes.sol";
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}



error InvalidBootstrappingStartTime();
error InvalidStreamStartTime();
error InvalidStreamEndTime();
error StreamDurationTooShort();
error BootstrappingDurationTooShort();
error WaitingDurationTooShort();
error InsufficientTokenPayment(uint256 requiredTokenAmount, uint256 tokenBalance);
error InvalidStreamOutDenom();
error InvalidInDenom();
error PaymentFailed();
error OperationNotAllowed();
error Unauthorized();
error InvalidWithdrawAmount();
error WithdrawAmountExceedsBalance(uint256 cap);
contract Stream {
    address public immutable owner;
    address public creator;
    address public positionStorageAddress;
    string public name;
    bool public streamCreated;

    // Primary statuses of the stream
    enum Status {
        Waiting,
        Bootstrapping,
        Active,
        Ended,
        Finalized,
        Cancelled
    }

    // Secondary statuses for Finalized state
    enum FinalizedStatus {
        None,
        Streamed,
        Refunded
    }

    struct StatusInfo {
        Status mainStatus;
        FinalizedStatus finalized;
        uint256 lastUpdated;
        uint256 bootstrappingStartTime;
        uint256 streamStartTime;
        uint256 streamEndTime;
    }

    struct StreamMetadata {
        string name;
    }

    struct StreamState {
        uint256 outRemaining;
        uint256 distIndex;
        uint256 spentIn;
        uint256 shares;
        uint256 currentStreamedPrice;
        uint256 threshold;
        uint256 inSupply;
        address inDenom;
        address streamOutDenom;
    }

    uint256 private constant MIN_WAITING_DURATION = 10 seconds;
    uint256 private constant MIN_BOOTSTRAPPING_DURATION = 10 seconds;
    uint256 private constant MIN_STREAM_DURATION = 50 seconds;

    IERC20 public token;
    StreamState public streamState;
    StreamMetadata public streamMetadata;
    StatusInfo public streamStatus;

    PositionStorage public positionStorage;

    event StreamCreated(
        uint256 indexed streamOutAmount,
        uint256 indexed bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime
    );

    constructor() {
        owner = msg.sender;
        streamCreated = false;
    }

    modifier isOwner() {
        require(msg.sender == owner, "Not the Owner");
        _;
    }

    modifier onlyOnce() {
        require(!streamCreated, "Stream already created");
        _;
    }

    function syncStreamExternal() external {
        syncStream();
        syncStreamStatus();
        emit StreamSynced(
            streamStatus.mainStatus,
            streamStatus.finalized,
            streamStatus.lastUpdated
        );
    }

    event StreamSynced(
        Status mainStatus,
        FinalizedStatus finalized,
        uint256 lastUpdated
    );

    function createStream(
        uint256 _streamOutAmount,
        address _streamOutDenom,
        uint256 _bootstrappingStartTime,
        uint256 _streamStartTime,
        uint256 _streamEndTime,
        uint256 _threshold,
        string memory _name,
        address _inDenom
    ) external isOwner onlyOnce payable {
        validateStreamTimes(block.timestamp, _bootstrappingStartTime, _streamStartTime, _streamEndTime);
        creator = msg.sender;
        positionStorage = new PositionStorage();
        positionStorageAddress = address(positionStorage);
        // Validate _inDenom
        try IERC20(_inDenom).balanceOf(msg.sender) returns (uint256 balance) {
            token = IERC20(_inDenom);
        } catch {
            revert InvalidStreamOutDenom();
        }

        // Validate _streamOutDenom
        try IERC20(_streamOutDenom).balanceOf(msg.sender) returns (uint256 balance) {
            token = IERC20(_streamOutDenom);
        } catch {
            revert InvalidStreamOutDenom();
        }

        // Ensure sender has enough tokens
        uint256 balance = token.balanceOf(msg.sender);
            if (balance < _streamOutAmount) {
    revert InsufficientTokenPayment(_streamOutAmount, balance);
}

// Transfer tokens
token.transferFrom(msg.sender, address(this), _streamOutAmount);

        streamState = StreamState({
            distIndex: 0,
            outRemaining: _streamOutAmount,
            inDenom: _inDenom,
            streamOutDenom: _streamOutDenom,
            inSupply: 0,
            spentIn: 0,
            shares: 0,
            currentStreamedPrice: 0,
            threshold: _threshold
        });

        streamMetadata = StreamMetadata({
            name: _name
        });

        streamStatus = StatusInfo({
            mainStatus: Status.Waiting,
            finalized: FinalizedStatus.None,
            lastUpdated: block.timestamp,
            bootstrappingStartTime: _bootstrappingStartTime,
            streamStartTime: _streamStartTime,
            streamEndTime: _streamEndTime
        });

        streamCreated = true;
        emit StreamCreated(_streamOutAmount, _bootstrappingStartTime, _streamStartTime, _streamEndTime);
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
        if (streamStatus.mainStatus == Status.Cancelled ||
            (streamStatus.mainStatus == Status.Finalized && 
            (streamStatus.finalized == FinalizedStatus.Streamed || 
             streamStatus.finalized == FinalizedStatus.Refunded))) {
            return;
        }

        // Update status based on current timestamp
        if (block.timestamp < streamStatus.bootstrappingStartTime) {
            streamStatus.mainStatus = Status.Waiting;
        } 
        else if (block.timestamp >= streamStatus.bootstrappingStartTime && 
                 block.timestamp < streamStatus.streamStartTime) {
            streamStatus.mainStatus = Status.Bootstrapping;
        }
        else if (block.timestamp >= streamStatus.streamStartTime && 
                 block.timestamp < streamStatus.streamEndTime) {
            streamStatus.mainStatus = Status.Active;
        }
        else if (block.timestamp >= streamStatus.streamEndTime) {
            streamStatus.mainStatus = Status.Ended;
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

    function subscribe(uint256 amountIn) external payable {
        // Get current status
        syncStreamStatus();
        if (streamStatus.mainStatus != Status.Bootstrapping && 
            streamStatus.mainStatus != Status.Active) {
            revert OperationNotAllowed();
        }
        // Validate if sender has enough tokens
        IERC20 streamInDenom = IERC20(streamState.inDenom);
        uint256 streamInDenomBalance = streamInDenom.balanceOf(msg.sender);
        if (streamInDenomBalance < amountIn) {
            revert InsufficientTokenPayment(amountIn, streamInDenomBalance);
        }
        // Transfer tokens from sender to this contract
        bool success = streamInDenom.transferFrom(msg.sender, address(this), amountIn);
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
            position = syncPosition(position);
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



    event Subscribed(address indexed subscriber, uint256 amountIn, uint256 newShares);

    function syncPosition(PositionTypes.Position memory position) internal view returns (PositionTypes.Position memory) {
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
        uint256 indexDiff = streamState.distIndex - updatedPosition.index;
        uint256 spent = 0;
        uint256 purchased = 0;

        // Only process if there are shares in the stream
        if (streamState.shares > 0) {
            // Calculate purchased amount based on position shares and index difference
            uint256 positionPurchased = (updatedPosition.shares * indexDiff) / 1e18 + updatedPosition.pendingReward;

            // Calculate remaining balance based on current shares ratio
            uint256 inRemaining = (streamState.inSupply * updatedPosition.shares) / streamState.shares;

            // Calculate spent amount
            spent = updatedPosition.inBalance - inRemaining;
            updatedPosition.spentIn += spent;
            updatedPosition.inBalance = inRemaining;

            // Update purchased amount
            purchased = positionPurchased;
            updatedPosition.purchased += purchased;
        }

        // Update position tracking
        updatedPosition.index = streamState.distIndex;
        updatedPosition.lastUpdateTime = block.timestamp;

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
        if (streamStatus.mainStatus != Status.Active && streamStatus.mainStatus != Status.Bootstrapping) {
            revert OperationNotAllowed();
        }

        syncStream();
        syncPosition(position);

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
        IERC20 streamInDenom = IERC20(streamState.inDenom);
        bool success = streamInDenom.transfer(msg.sender, cap);
        require(success, "Transfer failed");
        emit Withdrawn(msg.sender, cap);
    }

    event Withdrawn(address indexed subscriber, uint256 amountIn);

    function exitStream() external {
        PositionTypes.Position memory position = positionStorage.getPosition(msg.sender);
        if (position.shares == 0 || position.exitDate > 0) {
            revert OperationNotAllowed();
        }
        // Sync stream
        syncStream();
        // Sync position
        position = syncPosition(position);
        // Check status
        syncStreamStatus();
        // Exit is only allowed if stream is ended or finalized
        if (streamStatus.mainStatus != Status.Ended && streamStatus.mainStatus != Status.Finalized) {
            revert OperationNotAllowed();
        }
        // Refund in_amount remaining if any in position
        if (position.inBalance > 0) {
            IERC20 streamInDenom = IERC20(streamState.inDenom);
            streamInDenom.transfer(msg.sender, position.inBalance);
        }
        // send out_amount earned to msg.sender
        IERC20 streamOutDenom = IERC20(streamState.streamOutDenom);
        streamOutDenom.transfer(msg.sender, position.purchased-1);
        // Set exit date
        positionStorage.setExitDate(msg.sender, block.timestamp);
        emit Exited(msg.sender, position.purchased);
    }

    function finalizeStream() external {
        // Check is sender is the creator
        if (msg.sender != creator) {
            revert Unauthorized();
        }
        // Check status
        syncStreamStatus();
        // Finalize is only allowed if stream is ended 
        if (streamStatus.mainStatus != Status.Ended) {
            revert OperationNotAllowed();
        }
        // Sync stream
        syncStream();

        //Send total spent in to creator
        IERC20 streamInDenom = IERC20(streamState.inDenom);
        streamInDenom.transfer(creator, streamState.spentIn);
        // Send total out_remaining to creator if more than 0
        if (streamState.outRemaining > 0) {
            IERC20 streamOutDenom = IERC20(streamState.streamOutDenom);
            streamOutDenom.transfer(creator, streamState.outRemaining);
        }
        // Set stream status to finalized
        streamStatus.mainStatus = Status.Finalized;
        streamStatus.finalized = FinalizedStatus.Streamed;
        emit StreamFinalized(creator, streamState.spentIn, streamState.outRemaining);
    }
    
    event Exited(address indexed subscriber, uint256 purchased);
    event StreamFinalized(address indexed creator, uint256 spentIn, uint256 outRemaining);
}



