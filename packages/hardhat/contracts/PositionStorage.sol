// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./PositionTypes.sol";   

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
        positions[owner] = PositionTypes.Position(inBalance, shares, index, block.timestamp, 0, 0, 0, 0);
    }

    function updatePosition(
        address owner,
        PositionTypes.Position memory position
    ) external onlySender {
        positions[owner] = position;
    }

    function setExitDate(address owner, uint256 exitDate) external onlySender {
        positions[owner].exitDate = exitDate;
    }
}
