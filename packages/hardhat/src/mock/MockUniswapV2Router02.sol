// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUniswapV2Router02
 * @dev Minimal mock of Uniswap V2 Router for testing purposes.
 */
contract MockUniswapV2Router02 {
    address public immutable factory;

    constructor(address _factory) {
        factory = _factory;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 /* amountAMin */,
        uint256 /* amountBMin */,
        address /* to */,
        uint256 /* deadline */
    ) external pure returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // In the mock we simply return desired amounts and fake liquidity value
        amountA = amountADesired;
        amountB = amountBDesired;
        liquidity = (amountADesired + amountBDesired) / 2;
    }
} 