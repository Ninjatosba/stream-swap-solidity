// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title DecimalMath
 * @dev Library for handling decimal math operations with fixed-point arithmetic
 */
library DecimalMath {
    // We'll use 6 decimal places for precision
    uint256 public constant DECIMAL_PRECISION = 1e6;
    
    // Convert a regular number to a decimal representation
    function fromNumber(uint256 value) internal pure returns (uint256) {
        return value * DECIMAL_PRECISION;
    }
    function floor(uint256 value) internal pure returns (uint256) {
        return value / DECIMAL_PRECISION;
    }
    function ceil(uint256 value) internal pure returns (uint256) {
        return (value + DECIMAL_PRECISION - 1) / DECIMAL_PRECISION;
    }
    
    // Multiply two decimal numbers
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / DECIMAL_PRECISION;
    }
    
    // Divide two decimal numbers
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * DECIMAL_PRECISION) / b;
    }
    
    // Add two decimal numbers
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }
    
    // Subtract two decimal numbers
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return a - b;
    }
}