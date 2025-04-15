// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../StreamMathLib.sol";
import "../StreamTypes.sol";
import "../PositionTypes.sol";
import "../DecimalMath.sol";

contract StreamMathLibMock {
    function calculateDiff(
        uint256 currentTimestamp,
        uint256 streamStartTime,
        uint256 streamEndTime,
        uint256 lastUpdated
    ) external pure returns (Decimal memory) {
        return StreamMathLib.calculateDiff(currentTimestamp, streamStartTime, streamEndTime, lastUpdated);
    }

    function calculateStreamStatus(
        IStreamTypes.Status currentStatus,
        uint256 currentTime,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime
    ) external pure returns (IStreamTypes.Status) {
        return
            StreamMathLib.calculateStreamStatus(
                currentStatus,
                currentTime,
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime
            );
    }

    function calculateUpdatedState(
        IStreamTypes.StreamState memory state,
        Decimal memory diff
    ) external pure returns (IStreamTypes.StreamState memory) {
        return StreamMathLib.calculateUpdatedState(state, diff);
    }

    function computeSharesAmount(
        uint256 amountIn,
        bool roundUp,
        uint256 inSupply,
        uint256 totalShares
    ) external pure returns (uint256) {
        return StreamMathLib.computeSharesAmount(amountIn, roundUp, inSupply, totalShares);
    }

    function calculateExitFee(
        uint256 spentInAmount,
        Decimal memory ExitFeeRatio
    ) external pure returns (uint256 feeAmount, uint256 remainingAmount) {
        return StreamMathLib.calculateExitFee(spentInAmount, ExitFeeRatio);
    }

    function syncPosition(
        PositionTypes.Position memory position,
        Decimal memory distIndex,
        uint256 shares,
        uint256 inSupply,
        uint256 nowTime
    ) external pure returns (PositionTypes.Position memory) {
        return StreamMathLib.syncPosition(position, distIndex, shares, inSupply, nowTime);
    }
}
