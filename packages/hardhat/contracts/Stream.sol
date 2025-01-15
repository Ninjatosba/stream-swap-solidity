// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// IERC20 interface to interact with ERC-20 tokens
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

error InvalidBootstrappingStartTime();
error InvalidStreamStartTime();
error InvalidStreamEndTime();
error StreamDurationTooShort();
error BootstrappingDurationTooShort();
error WaitingDurationTooShort();
error InsufficientETHPayment();
error InsufficientTokenPayment(uint256 requiredTokenAmount, uint256 tokenBalance);
error InvalidInDenom();

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

    function updatePosition(
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

contract Stream {
    address public immutable owner;
    string public inDenomRequired;
    uint256 public streamOutAmount;
    uint256 public bootstrappingStartTime;
    uint256 public streamStartTime;
    uint256 public streamEndTime;
    uint256 public threshold;
    uint256 public spentIn;
    uint256 public shares;
    uint256 public currentStreamedPrice;
    uint256 public lastUpdated;
    address public positionStorageAddress;
    string public name;
    bool public streamCreated;

    uint256 private constant MIN_WAITING_DURATION = 5 minutes;
    uint256 private constant MIN_BOOTSTRAPPING_DURATION = 30 minutes;
    uint256 private constant MIN_STREAM_DURATION = 1 hours;

    // ERC-20 Token contract address (can be set when deploying)
    address public tokenAddress;
    IERC20 public token;

    event StreamCreated(
        uint256 indexed streamOutAmount,
        uint256 indexed bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime
    );

    // Constructor with no parameters
    constructor(
        string memory _inDenomRequired
    ) {
        owner = msg.sender;
        streamCreated = false;
        inDenomRequired = _inDenomRequired;
    }

    modifier isOwner() {
        require(msg.sender == owner, "Not the Owner");
        _;
    }

    modifier onlyOnce() {
        require(!streamCreated, "Stream has already been created");
        _;
    }

    function createStream(
        uint256 _streamOutAmount,
        uint256 _bootstrappingStartTime,
        uint256 _streamStartTime,
        uint256 _streamEndTime,
        uint256 _threshold,
        string memory _name,
        address _tokenAddress
    ) external isOwner onlyOnce {
        streamOutAmount = _streamOutAmount;
        bootstrappingStartTime = _bootstrappingStartTime;
        streamStartTime = _streamStartTime;
        streamEndTime = _streamEndTime;
        threshold = _threshold;
        name = _name;
        tokenAddress = _tokenAddress;
        token = IERC20(_tokenAddress);
        lastUpdated = block.timestamp;

        // Require ERC-20 token payment during contract deployment
        uint256 tokenBalance = token.balanceOf(msg.sender);
        if (tokenBalance < streamOutAmount) {
            revert InsufficientTokenPayment(streamOutAmount, tokenBalance);
        }

        // Validate stream times
        validateStreamTimes(block.timestamp, _bootstrappingStartTime, _streamStartTime, _streamEndTime);

        // Deploy PositionStorage contract
        PositionStorage positionStorage = new PositionStorage();
        positionStorageAddress = address(positionStorage);

        // Transfer ERC-20 tokens from the sender to this contract
        token.transferFrom(msg.sender, address(this), streamOutAmount);

        // Set streamCreated flag to true to prevent re-creation
        streamCreated = true;

        emit StreamCreated(
            _streamOutAmount,
            _bootstrappingStartTime,
            _streamStartTime,
            _streamEndTime
        );
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
}
