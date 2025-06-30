// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUniswapV2Factory
 * @dev Minimal mock of Uniswap V2 Factory for testing purposes.
 *      Only stores pair addresses and creates a deterministic dummy pair address.
 */
contract MockUniswapV2Factory {
    // mapping(tokenA => mapping(tokenB => pair))
    mapping(address => mapping(address => address)) public getPair;

    event PairCreated(address indexed token0, address indexed token1, address pair);

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Identical addresses");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");
        require(getPair[tokenA][tokenB] == address(0), "PAIR_EXISTS");

        // Generate a pseudo pair address using hash (not an actual contract)
        pair = address(uint160(uint256(keccak256(abi.encodePacked(tokenA, tokenB, block.timestamp)))));
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;

        emit PairCreated(tokenA, tokenB, pair);
    }
} 