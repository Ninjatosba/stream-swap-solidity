// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { DecimalMath, Decimal } from "../lib/math/DecimalMath.sol";

contract DecimalMathMock {
    using DecimalMath for Decimal;

    function testFromNumber(uint256 value) external pure returns (Decimal memory) {
        return DecimalMath.fromNumber(value);
    }

    function testToNumber(Decimal memory d) external pure returns (uint256, Decimal memory) {
        return DecimalMath.toNumber(d);
    }

    function testFloor(Decimal memory d) external pure returns (uint256) {
        return DecimalMath.floor(d);
    }

    function testCeil(Decimal memory d) external pure returns (uint256) {
        return DecimalMath.ceil(d);
    }

    function testMul(Decimal memory a, Decimal memory b) external pure returns (Decimal memory) {
        return DecimalMath.mul(a, b);
    }

    function testMulScalar(Decimal memory a, uint256 scalar) external pure returns (Decimal memory) {
        return DecimalMath.mulScalar(a, scalar);
    }

    function testDiv(Decimal memory a, Decimal memory b) external pure returns (Decimal memory) {
        return DecimalMath.div(a, b);
    }

    function testDivScalar(Decimal memory a, uint256 scalar) external pure returns (Decimal memory) {
        return DecimalMath.divScalar(a, scalar);
    }

    function testAdd(Decimal memory a, Decimal memory b) external pure returns (Decimal memory) {
        return DecimalMath.add(a, b);
    }

    function testSub(Decimal memory a, Decimal memory b) external pure returns (Decimal memory) {
        return DecimalMath.sub(a, b);
    }

    function testFromRatio(uint256 num, uint256 denom) external pure returns (Decimal memory) {
        return DecimalMath.fromRatio(num, denom);
    }

    function testGt(Decimal memory a, Decimal memory b) external pure returns (bool) {
        return DecimalMath.gt(a, b);
    }

    function testLt(Decimal memory a, Decimal memory b) external pure returns (bool) {
        return DecimalMath.lt(a, b);
    }
} 