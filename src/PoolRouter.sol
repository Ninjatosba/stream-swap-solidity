// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPoolRouter } from "./interfaces/IPoolRouter.sol";
import { IPoolWrapper } from "./interfaces/IPoolWrapper.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { PoolRouterTypes } from "./types/PoolRouterTypes.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { TransferLib } from "./lib/TransferLib.sol";

contract PoolRouter is Ownable, IPoolRouter {
    // Mapping of dex enum value => (key => wrapper address)
    mapping(uint8 => mapping(uint256 => address)) private _wrappers;

    // ============ Errors ============
    error InvalidAddress();
    error InvalidDexType();
    error WrapperNotFound();
    error InvalidAmount();
    error InvalidExtraParams();

    // ============ Events ============
    event WrapperSet(uint8 indexed dex, uint256 indexed key, address wrapper);
    event RoutedCreatePool(
        address indexed stream,
        address indexed wrapper,
        address pool,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1
    );

    constructor() Ownable() {}

    // ============ Admin ============

    function setWrapper(StreamTypes.DexType dex, uint256 key, address wrapper) external override onlyOwner {
        if (wrapper == address(0)) revert InvalidAddress();
        _wrappers[uint8(dex)][key] = wrapper;
        emit WrapperSet(uint8(dex), key, wrapper);
    }

    function getWrapper(StreamTypes.DexType dex, uint256 key) external view override returns (address) {
        return _wrappers[uint8(dex)][key];
    }

    // ============ Validation ============

    function validatePoolParams(StreamTypes.PoolInfo calldata info) external view override {
        (uint256 key, ) = _computeKey(info.dexType, info.extra);
        address w = _wrappers[uint8(info.dexType)][key];
        if (w == address(0)) revert WrapperNotFound();
        if (info.dexType == StreamTypes.DexType.V2 && info.extra.length != 0) revert InvalidExtraParams();
        if (info.dexType == StreamTypes.DexType.V3 && info.extra.length != 32) revert InvalidExtraParams();
        if (info.dexType == StreamTypes.DexType.Aerodrome && info.extra.length != 1) revert InvalidExtraParams();
    }

    // ============ Execution ============

    function createPool(PoolRouterTypes.CreatePoolRequest calldata req)
        external
        override
        returns (PoolWrapperTypes.CreatedPoolInfo memory)
    {
        if (req.tokenA == address(0) || req.tokenB == address(0)) revert InvalidAddress();
        if (req.amountADesired == 0 || req.amountBDesired == 0) revert InvalidAmount();
        if (req.tokenA == req.tokenB) revert InvalidAddress();
        if (req.creator == address(0)) revert InvalidAddress();

        (uint256 key, ) = _computeKey(req.dexType, req.extra);
        address wrapper = _wrappers[uint8(req.dexType)][key];
        if (wrapper == address(0)) revert WrapperNotFound();

        // Transfer funds to wrapper
        TransferLib.transferFunds(req.tokenA, address(this), wrapper, req.amountADesired);
        TransferLib.transferFunds(req.tokenB, address(this), wrapper, req.amountBDesired);

        // Call wrapper
        PoolWrapperTypes.CreatePoolMsg memory msg_ = PoolWrapperTypes.CreatePoolMsg({
            token0: req.tokenA,
            token1: req.tokenB,
            amount0Desired: req.amountADesired,
            amount1Desired: req.amountBDesired,
            creator: req.creator,
            extra: req.extra
        });

        PoolWrapperTypes.CreatedPoolInfo memory info = IPoolWrapper(wrapper).createPool(msg_);

        emit RoutedCreatePool(
            msg.sender,
            wrapper,
            info.poolAddress,
            info.token0,
            info.token1,
            info.amount0,
            info.amount1
        );

        return info;
    }

    // ============ Internals ============

    function _computeKey(
        StreamTypes.DexType dex,
        bytes memory extra
    ) internal pure returns (uint256 key, bool isAerodrome) {
        if (dex == StreamTypes.DexType.V2) {
            if (extra.length != 0) revert InvalidExtraParams();
            return (0, false);
        } else if (dex == StreamTypes.DexType.V3) {
            uint24 fee = abi.decode(extra, (uint24));
            if (fee == 0) revert InvalidExtraParams();
            return (uint256(fee), false);
        } else if (dex == StreamTypes.DexType.Aerodrome) {
            bool stable = abi.decode(extra, (bool));
            return (stable ? 1 : 0, true);
        } else {
            revert InvalidDexType();
        }
    }

    // Accept ETH for native token routing
    receive() external payable {}
}


