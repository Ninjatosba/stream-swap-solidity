// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./Stream.sol";

contract Controller {
    struct Params {
        uint256 streamCreationFee;    // Fixed fee to create a stream
        uint256 exitFeePercent;       // Fee percentage when exiting a stream
        uint256 minWaitingDuration;   // Minimum waiting period
        uint256 minBootstrappingDuration;  // Minimum bootstrapping period
        uint256 minStreamDuration;    // Minimum duration for a stream
        string[] acceptedInDenoms;    // Array of accepted token denominations
        address feeCollector;         // Address where fees are collected
        address protocolAdmin;        // Admin address for protocol
        uint256 tosVersion;          // Terms of service version
    }
    
    Params public params;
    mapping(address => bool) public streams;
    
    event StreamCreated(address indexed streamAddress, address indexed creator);
    event ParamsUpdated(Params params);
    event FeeCollectorUpdated(address newFeeCollector);
    event ProtocolAdminUpdated(address newProtocolAdmin);

    constructor(
        uint256 _streamCreationFee,
        uint256 _exitFeePercent,
        uint256 _minWaitingDuration,
        uint256 _minBootstrappingDuration,
        uint256 _minStreamDuration,
        string[] memory _acceptedInDenoms,
        address _feeCollector,
        address _protocolAdmin,
        uint256 _tosVersion
    ) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_protocolAdmin != address(0), "Invalid protocol admin");
        
        params = Params({
            streamCreationFee: _streamCreationFee,
            exitFeePercent: _exitFeePercent,
            minWaitingDuration: _minWaitingDuration,
            minBootstrappingDuration: _minBootstrappingDuration,
            minStreamDuration: _minStreamDuration,
            acceptedInDenoms: _acceptedInDenoms,
            feeCollector: _feeCollector,
            protocolAdmin: _protocolAdmin,
            tosVersion: _tosVersion
        });
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
        string[] memory _acceptedInDenoms,
        uint256 _tosVersion
    ) external onlyAdmin {
        params.streamCreationFee = _streamCreationFee;
        params.exitFeePercent = _exitFeePercent;
        params.minWaitingDuration = _minWaitingDuration;
        params.minBootstrappingDuration = _minBootstrappingDuration;
        params.minStreamDuration = _minStreamDuration;
        params.acceptedInDenoms = _acceptedInDenoms;
        params.tosVersion = _tosVersion;
        
        emit ParamsUpdated(params);
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

    function createStream() external payable returns (address) {
        require(msg.value >= params.streamCreationFee, "Insufficient creation fee");
        
        Stream newStream = new Stream();
        newStream.initialize(address(this), params);
        streams[address(newStream)] = true;
        // Forward the creation fee to fee collector
        (bool sent, ) = params.feeCollector.call{value: msg.value}("");
        require(sent, "Failed to send creation fee");
        
        emit StreamCreated(address(newStream), msg.sender);
        return address(newStream);
    }

    function isStream(address streamAddress) external view returns (bool) {
        return streams[streamAddress];
    }

    // Optional: Add ability to transfer ownership
    function transferOwnership(address newOwner) external onlyAdmin {
        require(newOwner != address(0), "Invalid new owner");
        params.protocolAdmin = newOwner;
    }
} 