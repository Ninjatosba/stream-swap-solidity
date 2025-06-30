// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PositionTypes } from "../types/PositionTypes.sol";
import { Decimal } from "../lib/math/DecimalMath.sol";

interface IPositionStorage {
    function getPosition(address _owner) external view returns (PositionTypes.Position memory);

    function createPosition(address owner, uint256 inBalance, uint256 shares, Decimal memory index) external;

    function updatePosition(address owner, PositionTypes.Position memory position) external;

    function setExitDate(address owner, uint256 exitDate) external;
}
