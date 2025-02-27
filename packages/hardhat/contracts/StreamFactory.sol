// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./Stream.sol";
import "./StreamEvents.sol";
contract StreamFactory is IStreamEvents {
    struct Params {
        uint256 streamCreationFee;    // Fixed fee to create a stream
        address streamCreationFeeToken; // Token used for creation fee,
        uint256 exitFeePercent;       // Fee percentage when exiting a stream
        uint256 minWaitingDuration;   // Minimum waiting period
        uint256 minBootstrappingDuration;  // Minimum bootstrapping period
        uint256 minStreamDuration;    // Minimum duration for a stream
        address feeCollector;         // Address where fees are collected
        address protocolAdmin;        // Admin address for protocol
        string tosVersion;          // Terms of service version
    }

    mapping(address => bool) public acceptedTokens;
    
    address public constant NATIVE_TOKEN = address(0);

    uint256 public streamId;
    
    Params public params;
    mapping(address => bool) public streams;

    bool public frozen;

    constructor(
        uint256 _streamCreationFee,
        address _streamCreationFeeToken,
        uint256 _exitFeePercent,
        uint256 _minWaitingDuration,
        uint256 _minBootstrappingDuration,
        uint256 _minStreamDuration,
        address[] memory _acceptedTokens,
        address _feeCollector,
        address _protocolAdmin,
        string memory _tosVersion
    ) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_protocolAdmin != address(0), "Invalid protocol admin");
        
        params = Params({
            streamCreationFee: _streamCreationFee,
            streamCreationFeeToken: _streamCreationFeeToken,
            exitFeePercent: _exitFeePercent,
            minWaitingDuration: _minWaitingDuration,
            minBootstrappingDuration: _minBootstrappingDuration,
            minStreamDuration: _minStreamDuration,
            feeCollector: _feeCollector,
            protocolAdmin: _protocolAdmin,
            tosVersion: _tosVersion
        });

        // Set accepted tokens
        for (uint i = 0; i < _acceptedTokens.length; i++) {
            acceptedTokens[_acceptedTokens[i]] = true;
        }
        streamId = 0;
    }

    modifier onlyAdmin() {
        require(msg.sender == params.protocolAdmin, "Not the admin");
        _;
    }

    function updateParams(
        uint256 _streamCreationFee,
        uint256 _exitFeePercent,
        uint256 _minWaitingDuration,
        uint256 _minBootstrappingDuration,
        uint256 _minStreamDuration,
        string memory _tosVersion
    ) external onlyAdmin {
        params.streamCreationFee = _streamCreationFee;
        params.exitFeePercent = _exitFeePercent;
        params.minWaitingDuration = _minWaitingDuration;
        params.minBootstrappingDuration = _minBootstrappingDuration;
        params.minStreamDuration = _minStreamDuration;
        params.tosVersion = _tosVersion;
        
        emit ParamsUpdated();
    }

    function updateFeeCollector(address _feeCollector) external onlyAdmin {
        require(_feeCollector != address(0), "Invalid fee collector");
        params.feeCollector = _feeCollector;
        emit FeeCollectorUpdated(_feeCollector);
    }

    function updateProtocolAdmin(address _protocolAdmin) external onlyAdmin {
        require(_protocolAdmin != address(0), "Invalid protocol admin");
        params.protocolAdmin = _protocolAdmin;
        emit ProtocolAdminUpdated(_protocolAdmin);
    }

    function updateAcceptedTokens(address[] calldata tokens_to_add, address[] calldata tokens_to_remove) external onlyAdmin {
        for (uint i = 0; i < tokens_to_add.length; i++) {
            acceptedTokens[tokens_to_add[i]] = true;
        }
        for (uint i = 0; i < tokens_to_remove.length; i++) {
            acceptedTokens[tokens_to_remove[i]] = false;
        }
    }

    function isAcceptedToken(address token) public view returns (bool) {
        return acceptedTokens[token];
    }

    function createStream(
        uint256 _streamOutAmount,
        address _streamOutDenom,
        uint256 _bootstrappingStartTime,
        uint256 _streamStartTime,
        uint256 _streamEndTime,
        uint256 _threshold,
        string memory _name,
        address _inDenom,
        string memory _tosVersion,
        bytes32 _salt
    ) external payable {
        // Check if contract is accepting new streams (not frozen)
        require(!frozen, "Contract is frozen");
        
        // Validate input parameters
        require(_streamOutAmount > 0, "Zero out supply not allowed");
        require(acceptedTokens[_inDenom], "Stream in denom not accepted");
        
        // Validate time parameters
        require(_bootstrappingStartTime >= block.timestamp, "Invalid bootstrapping start time");
        require(_streamStartTime > _bootstrappingStartTime, "Stream start must be after bootstrapping");
        require(_streamEndTime > _streamStartTime, "Stream end must be after start");
        
        // Validate durations against minimum requirements
        require(_streamStartTime - _bootstrappingStartTime >= params.minBootstrappingDuration, 
            "Bootstrapping duration too short");
        require(_streamEndTime - _streamStartTime >= params.minStreamDuration,
            "Stream duration too short");
        
        // Validate TOS version
        require(keccak256(abi.encodePacked(_tosVersion)) == keccak256(abi.encodePacked(params.tosVersion)), "Invalid ToS version");

        // Load creation fee
        uint256 creationFee = params.streamCreationFee;
        if (creationFee > 0) {
            if (params.streamCreationFeeToken == address(0)) {
                // Native token
                require(msg.value >= creationFee, "Insufficient native token");
                // Transfer fee to fee collector
                require(payable(params.feeCollector).send(creationFee), "Fee transfer failed");
            } else {
                // ERC20 token
                require(IERC20(params.streamCreationFeeToken).transferFrom(msg.sender, address(params.feeCollector), creationFee), "Token transfer failed");
            }
        }
        // Increment stream id
        // Predict stream address
        streamId++;
bytes32 bytecodeHash = keccak256(abi.encodePacked(
    type(Stream).creationCode,
    abi.encode(
        _streamOutAmount,
        _streamOutDenom,
        _bootstrappingStartTime,
        _streamStartTime,
        _streamEndTime,
        _threshold,
        _name,
        _inDenom,
        msg.sender
    )
));

        address predictedAddress = predictAddress(address(this), _salt, bytecodeHash);
        // Transfer out denom to stream contract
        require(IERC20(_streamOutDenom).transferFrom(msg.sender, predictedAddress, _streamOutAmount), "Token transfer failed");
        // Deploy new stream contract with all parameters
        Stream newStream = new Stream{salt: _salt}(
            _streamOutAmount,
            _streamOutDenom,
            _bootstrappingStartTime,
            _streamStartTime,
            _streamEndTime,
            _threshold,
            _name,
            _inDenom,
            msg.sender
            );

        require(address(newStream) == predictedAddress, "Stream address prediction failed");
            

        emit StreamCreated(
            _streamOutAmount,
            _bootstrappingStartTime,
            _streamStartTime,
            _streamEndTime,
            address(newStream)
        );
    }

    function isStream(address streamAddress) external view returns (bool) {
        return streams[streamAddress];
    }

    // Optional: Add ability to transfer ownership
    function transferOwnership(address newOwner) external onlyAdmin {
        require(newOwner != address(0), "Invalid new owner");
        params.protocolAdmin = newOwner;
    }

    function setFrozen(bool _frozen) external onlyAdmin {
        frozen = _frozen;
        emit FrozenStateUpdated(_frozen);
    }

    function predictAddress(address creator, bytes32 _salt, bytes32 bytecodeHash) public pure returns (address) {
        return address(uint160(uint(keccak256(abi.encodePacked(
            bytes1(0xff),
            creator,
            _salt,
            bytecodeHash
        )))));
    }
} 