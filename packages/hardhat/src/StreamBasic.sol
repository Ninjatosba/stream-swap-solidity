// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamBasic
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Basic implementation of StreamCore with minimal features
 * @dev This contract provides the simplest streaming functionality without
 *      vesting or pool creation features. All hooks use default implementations
 *      from StreamCore (direct transfers).
 */

import { StreamCore } from "./StreamCore.sol";

contract StreamBasic is StreamCore {
    /**
     * @notice Contract version for tracking upgrades
     */
    string public constant VERSION = "1.0.0";

    /**
     * @notice Contract variant identifier
     */
    string public constant VARIANT = "Basic";

    // ============ Constructor ============
    // No constructor needed - proxy pattern uses initialize

    // ============ Override Functions ============
    // StreamBasic uses all default hook implementations from StreamCore
    // No overrides needed - direct transfers for all cases

    /**
     * @dev Returns the implementation name for identification
     * @return Implementation name and version
     */
    function implementation() external pure returns (string memory) {
        return string(abi.encodePacked("StreamBasic v", VERSION));
    }
}
