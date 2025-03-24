// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Decimal type and math operations
 * @dev Library for handling decimal math operations with fixed-point arithmetic
 */

// Define the Decimal struct at the top level for easier imports
struct Decimal {
    uint256 value; // Value scaled by DECIMAL_PRECISION
}

/**
 * @title DecimalMath
 * @dev Library for handling decimal math operations with fixed-point arithmetic
 */
library DecimalMath {
    // We'll use 6 decimal places for precision
    uint256 public constant DECIMAL_PRECISION = 1e6;

    // Convert a regular number to a Decimal
    function fromNumber(uint256 value) internal pure returns (Decimal memory) {
        return Decimal({ value: value * DECIMAL_PRECISION });
    }

    // Convert a Decimal to a regular number while keeping the remainder
    function toNumber(Decimal memory d) internal pure returns (uint256, Decimal memory) {
        return (d.value / DECIMAL_PRECISION, Decimal({ value: d.value % DECIMAL_PRECISION }));
    }

    // Floor division for Decimal
    function floor(Decimal memory d) internal pure returns (uint256) {
        return d.value / DECIMAL_PRECISION;
    }

    // Ceiling division for Decimal
    function ceil(Decimal memory d) internal pure returns (uint256) {
        return (d.value + DECIMAL_PRECISION - 1) / DECIMAL_PRECISION;
    }

    // Multiply two Decimals
    function mul(Decimal memory a, Decimal memory b) internal pure returns (Decimal memory) {
        return Decimal({ value: (a.value * b.value) / DECIMAL_PRECISION });
    }

    // Multiply Decimal by a scalar
    function mulScalar(Decimal memory a, uint256 scalar) internal pure returns (Decimal memory) {
        return Decimal({ value: a.value * scalar });
    }

    // Divide two Decimals
    function div(Decimal memory a, Decimal memory b) internal pure returns (Decimal memory) {
        return Decimal({ value: (a.value * DECIMAL_PRECISION) / b.value });
    }

    // Divide Decimal by a scalar
    function divScalar(Decimal memory a, uint256 scalar) internal pure returns (Decimal memory) {
        return Decimal({ value: a.value / scalar });
    }

    // Add two Decimals
    function add(Decimal memory a, Decimal memory b) internal pure returns (Decimal memory) {
        return Decimal({ value: a.value + b.value });
    }

    // Subtract two Decimals
    function sub(Decimal memory a, Decimal memory b) internal pure returns (Decimal memory) {
        return Decimal({ value: a.value - b.value });
    }

    // From ratio to Decimal
    function fromRatio(uint256 numerator, uint256 denominator) internal pure returns (Decimal memory) {
        return Decimal({ value: (numerator * DECIMAL_PRECISION) / denominator });
    }
}
