// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PositionStorage
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Secure, isolated storage for user participation data in StreamSwap streams
 * @dev PositionStorage implements a separation-of-concerns architecture where user data
 *      is isolated from stream logic for enhanced security and modularity. Each stream
 *      deploys its own PositionStorage instance, ensuring data isolation and preventing
 *      cross-stream interference.
 *      
 *      Security Features:
 *      - Single-stream access control: Only the deploying stream can modify data
 *      - Immutable stream address: Cannot be changed after deployment
 *      - Isolated storage: Each stream has its own position data
 *      - Comprehensive position tracking: Balances, shares, distributions, exit status
 *   
 */

import { PositionTypes } from "../types/PositionTypes.sol";
import { Decimal, DecimalMath } from "../lib/math/DecimalMath.sol";

contract PositionStorage {
    using PositionTypes for PositionTypes.Position;

    error UnauthorizedAccess();
    error InvalidStreamContractAddress();

    mapping(address => PositionTypes.Position) private positions;
    address public immutable STREAM_CONTRACT_ADDRESS;

    constructor(address contractAddress) {
        if (contractAddress == address(0)) revert InvalidStreamContractAddress();
        STREAM_CONTRACT_ADDRESS = contractAddress;
    }

    function getPosition(address owner) external view returns (PositionTypes.Position memory) {
        return positions[owner];
    }

    modifier onlyStreamContract() {
        if (msg.sender != STREAM_CONTRACT_ADDRESS) revert UnauthorizedAccess();
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
