// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StreamTypes } from "./StreamTypes.sol";

library PoolRouterTypes {
    struct V3Extra {
        uint24 fee;
    }

    struct AerodromeExtra {
        bool stable;
    }

    struct CreatePoolRequest {
        address tokenA;
        address tokenB;
        uint256 amountADesired;
        uint256 amountBDesired;
        StreamTypes.DexType dexType;
        bytes extra;        // abi-encoded per-dex extra params
        address creator;    // LP recipient/refund target
    }
}


