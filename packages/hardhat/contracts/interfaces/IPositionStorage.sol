// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../types/PositionTypes.sol";
import "../lib/math/DecimalMath.sol";

interface IPositionStorage {
    function getPosition(address _owner) external view returns (PositionTypes.Position memory);

    function createPosition(address owner, uint256 inBalance, uint256 shares, Decimal memory index) external;

    function updatePosition(address owner, PositionTypes.Position memory position) external;

    function setExitDate(address owner, uint256 exitDate) external;
}
