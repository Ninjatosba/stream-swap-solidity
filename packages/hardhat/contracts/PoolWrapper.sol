// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./types/PoolWrapperTypes.sol";

contract PoolWrapper is Ownable {
    using SafeERC20 for IERC20;

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

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Creates a pool and adds liquidity
     * @param createPoolMsg The parameters for pool creation and liquidity addition
     * Callable by anyone
     */
    function createPool(
        PoolWrapperTypes.CreatePoolMsg calldata createPoolMsg
    ) external returns (PoolWrapperTypes.CreatedPoolInfo memory) {
        // TODO: Implement pool creation logic
        // 1. Validate that the tokens are valid ERC20s
        // 2. Validate that the tokens are not the same
        // 3. Validate that the pool doesn't already exist
        // 4. Validate that the tokens are sent to this contract
        // 5. Create the pool
        // 6. Add liquidity to the pool
        // 7. Store the pool info

        // For testing purposes only - remove this when implementing the TODOs above
        address mockPoolAddress = address(
            uint160(uint256(keccak256(abi.encodePacked(createPoolMsg.token0, createPoolMsg.token1, block.timestamp))))
        );

        // Create pool info
        PoolWrapperTypes.CreatedPoolInfo memory poolInfo = PoolWrapperTypes.CreatedPoolInfo({
            poolAddress: mockPoolAddress,
            token0: createPoolMsg.token0,
            token1: createPoolMsg.token1
        });

        // Store pool info
        streamPools[msg.sender] = poolInfo;

        // Emit event
        emit PoolCreated(
            msg.sender,
            mockPoolAddress,
            address(this),
            createPoolMsg.token0,
            createPoolMsg.token1,
            createPoolMsg.amount0,
            createPoolMsg.amount1
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
