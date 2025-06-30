// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Decimal } from "../lib/math/DecimalMath.sol";

library PositionTypes {
    struct Position {
        uint256 inBalance;
        uint256 shares;
        Decimal index;
        uint256 lastUpdateTime;
        Decimal pendingReward;
        uint256 spentIn;
        uint256 purchased;
        uint256 exitDate;
    }
}
