// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAerodromeFactory {
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool);
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
    function allPoolsLength() external view returns (uint256);
    function isPool(address pool) external view returns (bool);
    function createPool(address tokenA, address tokenB, bool stable) external returns (address pool);
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
    function setFeeManager(address _feeManager) external;
    function setPauser(address _pauser) external;
    function setPauseState(bool _state) external;
    function setVoter(address _voter) external;
    function setFee(bool _stable, uint256 _fee) external;
    function setCustomFee(address _pool, uint256 _fee) external;
    function getFee(address _pool, bool _stable) external view returns (uint256);
    function isPaused() external view returns (bool);
    function voter() external view returns (address);
    function implementation() external view returns (address);
}

interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);

    function addLiquidityETH(
        address token,
        bool stable,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB);

    function removeLiquidityETH(
        address token,
        bool stable,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external returns (uint amountToken, uint amountETH);

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactETHForTokens(
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountOut(
        uint amountIn,
        address tokenIn,
        address tokenOut,
        bool stable,
        address factory
    ) external view returns (uint amountOut);

    function getAmountsOut(
        uint amountIn,
        Route[] memory routes
    ) external view returns (uint[] memory amounts);

    function quoteAddLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        address factory,
        uint amountADesired,
        uint amountBDesired
    ) external view returns (uint amountA, uint amountB, uint liquidity);

    function quoteRemoveLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        address factory,
        uint liquidity
    ) external view returns (uint amountA, uint amountB);

    function factory() external view returns (address);
    function weth() external view returns (address);
}

// Interface for Aerodrome pools - includes functions needed for pool queries
interface IAerodromePool {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function reserve0() external view returns (uint256);
    function reserve1() external view returns (uint256);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function totalSupply() external view returns (uint256);
    function stable() external view returns (bool);
}


