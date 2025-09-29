// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ITokenFactory } from "./interfaces/ITokenFactory.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { StandardERC20 } from "./tokens/StandardERC20.sol";

/**
 * @title TokenFactory
 * @notice Creates standard ERC20 tokens
 */
contract TokenFactory is ITokenFactory {
    event TokenCreated(address indexed token, string name, string symbol, uint8 decimals, uint256 totalSupply);

    function createToken(
        StreamTypes.TokenCreationInfo calldata tokenInfo,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external returns (address tokenAddress) {
        require(recipients.length == amounts.length, "Length mismatch");
        
        StandardERC20 token = new StandardERC20(
            tokenInfo.name,
            tokenInfo.symbol,
            tokenInfo.decimals,
            recipients,
            amounts,
            bytes32(0)
        );
        tokenAddress = address(token);
        
        emit TokenCreated(tokenAddress, tokenInfo.name, tokenInfo.symbol, tokenInfo.decimals, tokenInfo.totalSupply);
    }
}


