// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { IUniswapV2Factory, IUniswapV2Router02 } from "./interfaces/IUniswapV2.sol";
import { IPoolWrapperErrors } from "./interfaces/IPoolWrapperErrors.sol";

contract PoolWrapper is Ownable, IPoolWrapperErrors {
    using SafeERC20 for IERC20;

    // Uniswap V2 addresses - these should be configurable per network
    address public immutable UNISWAP_V2_FACTORY;
    address public immutable UNISWAP_V2_ROUTER;
    
    // Mapping from stream address to pool info
    mapping(address => PoolWrapperTypes.CreatedPoolInfo) public streamPools;

    event PoolCreated(
        address indexed stream,
        address indexed pool,
        address indexed poolWrapper,
        address token0,
        address token1,
        uint256 token0Amount,
        uint256 token1Amount
    );

    constructor(address _uniswapV2Factory, address _uniswapV2Router) Ownable() {
        if (_uniswapV2Factory == address(0)) revert InvalidAddress();
        if (_uniswapV2Router == address(0)) revert InvalidAddress();
        
        UNISWAP_V2_FACTORY = _uniswapV2Factory;
        UNISWAP_V2_ROUTER = _uniswapV2Router;
    }

    /**
     * @notice Creates a pool and adds liquidity
     * @param createPoolMsg The parameters for pool creation and liquidity addition
     * Callable by anyone
     */
    function createPool(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) external returns (PoolWrapperTypes.CreatedPoolInfo memory) {
        // Validate that the tokens are valid ERC20s
        if (createPoolMsg.token0 == address(0)) revert InvalidAddress();
        if (createPoolMsg.token1 == address(0)) revert InvalidAddress();
        if (createPoolMsg.token0 == createPoolMsg.token1) revert DifferentTokensRequired();
        if (createPoolMsg.amount0 == 0) revert InvalidAmount();
        if (createPoolMsg.amount1 == 0) revert InvalidAmount();

        // Validate that the tokens are sent to this contract
        if (IERC20(createPoolMsg.token0).balanceOf(address(this)) < createPoolMsg.amount0) {
            revert InsufficientBalance();
        }
        if (IERC20(createPoolMsg.token1).balanceOf(address(this)) < createPoolMsg.amount1) {
            revert InsufficientBalance();
        }

        // Check if pool already exists
        IUniswapV2Factory factory = IUniswapV2Factory(UNISWAP_V2_FACTORY);
        address existingPool = factory.getPair(createPoolMsg.token0, createPoolMsg.token1);
        
        address poolAddress;
        if (existingPool == address(0)) {
            // Create the pool
            poolAddress = factory.createPair(createPoolMsg.token0, createPoolMsg.token1);
            if (poolAddress == address(0)) revert PoolCreationFailed();
        } else {
            poolAddress = existingPool;
        }

        // Add liquidity to the pool
        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAP_V2_ROUTER);
        
        // Approve router to spend tokens
        IERC20(createPoolMsg.token0).approve(UNISWAP_V2_ROUTER, createPoolMsg.amount0);
        IERC20(createPoolMsg.token1).approve(UNISWAP_V2_ROUTER, createPoolMsg.amount1);
        
        // Add liquidity (returns actual amounts added and LP tokens received)
        (uint256 amountA, uint256 amountB, ) = router.addLiquidity(
            createPoolMsg.token0,
            createPoolMsg.token1,
            createPoolMsg.amount0,
            createPoolMsg.amount1,
            0, // amountAMin - accept any amount
            0, // amountBMin - accept any amount
            address(0), // LP tokens are burned
            block.timestamp + 300 // 5 minute deadline
        );

        // Store the pool info
        PoolWrapperTypes.CreatedPoolInfo memory poolInfo = PoolWrapperTypes.CreatedPoolInfo({
            poolAddress: poolAddress,
            token0: createPoolMsg.token0,
            token1: createPoolMsg.token1
        });

        streamPools[msg.sender] = poolInfo;

        // Emit events
        emit PoolCreated(
            msg.sender,
            poolAddress,
            address(this),
            createPoolMsg.token0,
            createPoolMsg.token1,
            amountA,
            amountB
        );

        return poolInfo;
    }

    /**
     * @notice Gets pool info for a stream
     * @param stream The stream address
     */
    function getPoolInfo(address stream) external view returns (PoolWrapperTypes.CreatedPoolInfo memory) {
        return streamPools[stream];
    }
}
