// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StreamFactoryTypes } from "../types/StreamFactoryTypes.sol";

/**
 * @title IStreamFactoryParams
 * @notice Minimal interface to read factory params without importing a concrete factory
 */
interface IStreamFactoryParams {
    function getParams() external view returns (StreamFactoryTypes.Params memory);
}


