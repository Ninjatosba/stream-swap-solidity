// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./Stream.sol";

/**
 * @title StreamTest
 * @dev This contract is used for testing internal functions of the Stream contract
 */
contract StreamTest is Stream {
    constructor(
        uint256 _streamOutAmount,
        address _streamOutDenom,
        uint256 _bootstrappingStartTime,
        uint256 _streamStartTime,
        uint256 _streamEndTime,
        uint256 _threshold,
        string memory _name,
        address _inDenom,
        address _creator
    ) Stream(
        _streamOutAmount,
        _streamOutDenom,
        _bootstrappingStartTime,
        _streamStartTime,
        _streamEndTime,
        _threshold,
        _name,
        _inDenom,
        _creator
    ) {}

    // Expose internal functions as public for testing

    function test_validateStreamTimes(
        uint256 nowTime,
        uint256 _bootstrappingStartTime,
        uint256 _startTime,
        uint256 _endTime
    ) public pure {
        validateStreamTimes(nowTime, _bootstrappingStartTime, _startTime, _endTime);
    }

    function test_calculateDiff() public view returns (uint256) {
        return calculateDiff();
    }

    function test_computeSharesAmount(uint256 amountIn, bool roundUp) public view returns (uint256) {
        return computeSharesAmount(amountIn, roundUp);
    }

    function test_syncPosition(PositionTypes.Position memory position) public view returns (PositionTypes.Position memory) {
        return syncPosition(position);
    }

    // Test functions for the new internal functions
    
    function test_isOperationAllowed(IStreamTypes.Status[] memory allowedStatuses) public view returns (bool) {
        return isOperationAllowed(allowedStatuses);
    }
    
    function test_safeTokenTransfer(address tokenAddress, address recipient, uint256 amount) public returns (bool) {
        return safeTokenTransfer(tokenAddress, recipient, amount);
    }
    
    function test_calculateExitFee(uint256 spentInAmount) public view returns (uint256 feeAmount, uint256 remainingAmount) {
        return calculateExitFee(spentInAmount);
    }
    
    function test_isThresholdReached() public view returns (bool) {
        return isThresholdReached();
    }
    
    function test_isValidActivePosition(PositionTypes.Position memory position) public pure returns (bool) {
        return isValidActivePosition(position);
    }

    // Add more test functions for other internal functions as needed
} 