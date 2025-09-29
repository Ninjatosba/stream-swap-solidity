// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StreamTypes } from "../types/StreamTypes.sol";

interface ITokenFactory {
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply
    );

    function createToken(
        StreamTypes.TokenCreationInfo calldata tokenInfo,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external returns (address tokenAddress);
}


