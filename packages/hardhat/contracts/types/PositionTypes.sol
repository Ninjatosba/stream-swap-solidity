// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../lib/math/DecimalMath.sol";

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
