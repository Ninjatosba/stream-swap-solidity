// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PositionStorage {
    struct Position {
        uint256 inBalance;
        uint256 shares;
        uint256 index;
        uint256 lastUpdateTime;
        uint256 pendingReward;
        uint256 spentIn;
        uint256 purchased;
        string exitDate;
    }

    address public immutable streamContractAddress;
    mapping(address => Position) private positions;

    constructor() {
        streamContractAddress = msg.sender;
    }

    function getPosition(address _owner) external view returns (Position memory) {
        return positions[_owner];
    }

    modifier onlySender() {
        require(msg.sender == streamContractAddress, "Position can only be set by the stream contract");
        _;
    }

    function createPosition(
        address owner,
        uint256 inBalance,
        uint256 shares,
        uint256 index
    ) external onlySender {
        positions[owner] = Position(inBalance, shares, index, block.timestamp, 0, 0, 0, "");
    }

    function setExitDate(address owner, string memory exitDate) external onlySender {
        positions[owner].exitDate = exitDate;
    }
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
contract Stream {
    address public immutable owner;
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

        PositionStorage positionStorage = new PositionStorage();
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
}