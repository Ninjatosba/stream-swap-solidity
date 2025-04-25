// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../types/PositionTypes.sol";
import "../lib/math/DecimalMath.sol";

contract PositionStorage {
    using PositionTypes for PositionTypes.Position;

    mapping(address => PositionTypes.Position) private positions;
    address public immutable streamContractAddress;

    constructor() {
        streamContractAddress = msg.sender;
    }

    function getPosition(address _owner) external view returns (PositionTypes.Position memory) {
        return positions[_owner];
    }

    modifier onlyStreamContract() {
        require(msg.sender == streamContractAddress, "Position can only be set by the stream contract");
        _;
    }

    function createPosition(
        address owner,
        uint256 inBalance,
        uint256 shares,
        Decimal memory index
    ) external onlyStreamContract {
        positions[owner] = PositionTypes.Position(
            inBalance,
            shares,
            index,
            block.timestamp,
            DecimalMath.fromNumber(0),
            0,
            0,
            0
        );
    }

    function updatePosition(address owner, PositionTypes.Position memory position) external onlyStreamContract {
        positions[owner] = position;
    }

    function setExitDate(address owner, uint256 exitDate) external onlyStreamContract {
        positions[owner].exitDate = exitDate;
    }
}
