// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StreamTypes.sol";
import "./DecimalMath.sol";
import "./PositionTypes.sol";

import "hardhat/console.sol";

library StreamMathLib {
    /**
     * @dev Calculates the time difference ratio between current time and last updated time
     * @param currentTimestamp Current timestamp
     * @param streamStartTime Timestamp when the stream starts
     * @param streamEndTime Timestamp when the stream ends
     * @param lastUpdated Timestamp when the stream was last updated
     * @return The ratio of time elapsed since last update compared to total remaining time (scaled by 1e18)
     */
    function calculateDiff(
        uint256 currentTimestamp,
        uint256 streamStartTime,
        uint256 streamEndTime,
        uint256 lastUpdated
    ) internal pure returns (uint256) {
        // If the stream is not started yet or already ended, return 0
        if (currentTimestamp < streamStartTime || lastUpdated >= streamEndTime) {
            return 0;
        }

        // If lastUpdated is before start time, set it to start time
        uint256 effectiveLastUpdated = lastUpdated;
        if (effectiveLastUpdated < streamStartTime) {
            effectiveLastUpdated = streamStartTime;
        }

        // If current time is past end time, use end time instead
        uint256 effectiveNow = currentTimestamp;
        if (effectiveNow > streamEndTime) {
            effectiveNow = streamEndTime;
        }

        uint256 numerator = effectiveNow - effectiveLastUpdated;
        uint256 denominator = streamEndTime - effectiveLastUpdated;

        if (denominator == 0 || numerator == 0) {
            return 0;
        }
        // Return ratio of time elapsed since last update compared to total remaining time
        return (numerator * 1e18) / denominator;
    }

    /**
     * @dev Calculates the stream status based on the current state and timestamp
     * @param currentStatus Current status of the stream
     * @param currentTime Current timestamp to check against
     * @param bootstrappingStartTime Timestamp when bootstrapping phase starts
     * @param streamStartTime Timestamp when active streaming starts
     * @param streamEndTime Timestamp when streaming ends
     * @return IStreamTypes.Status The calculated stream status
     */
    function calculateStreamStatus(
        IStreamTypes.Status currentStatus,
        uint256 currentTime,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime
    ) internal pure returns (IStreamTypes.Status) {
        // Don't update if stream is in a final state
        if (
            currentStatus == IStreamTypes.Status.Cancelled ||
            currentStatus == IStreamTypes.Status.FinalizedRefunded ||
            currentStatus == IStreamTypes.Status.FinalizedStreamed
        ) {
            return currentStatus;
        }

        // Update status based on current timestamp
        if (currentTime < bootstrappingStartTime) {
            return IStreamTypes.Status.Waiting;
        } else if (currentTime >= bootstrappingStartTime && currentTime < streamStartTime) {
            return IStreamTypes.Status.Bootstrapping;
        } else if (currentTime >= streamStartTime && currentTime < streamEndTime) {
            return IStreamTypes.Status.Active;
        } else if (currentTime >= streamEndTime) {
            return IStreamTypes.Status.Ended;
        }

        // This should never be reached, but return current status as fallback
        return currentStatus;
    }

    /**
     * @dev Calculates updated stream state based on time difference
     * @param state Current stream state
     * @param diff Time difference in seconds
     * @return Updated stream state
     */
    function calculateUpdatedState(
        IStreamTypes.StreamState memory state,
        uint256 diff
    ) internal pure returns (IStreamTypes.StreamState memory) {
        // Create a copy of the state to avoid modifying the input
        IStreamTypes.StreamState memory newState = state;

        if (newState.shares > 0 && diff > 0) {
            // Calculate new distribution balance and spent in amount
            uint256 newDistributionBalance = (newState.outRemaining * diff) / 1e18;
            uint256 spentIn = (newState.inSupply * diff) / 1e18;

            // Update state variables
            newState.spentIn += spentIn;
            newState.inSupply -= spentIn;

            if (newDistributionBalance > 0) {
                newState.outRemaining -= newDistributionBalance;
                // Update distribution index (shares are in base units, multiply by 1e18 for precision)
                newState.distIndex += (newDistributionBalance * 1e18) / newState.shares;
                // Update current streamed price
                newState.currentStreamedPrice = (spentIn * 1e18) / newDistributionBalance;
            }
        }

        return newState;
    }

    function computeSharesAmount(
        uint256 amountIn,
        bool roundUp,
        uint256 inSupply,
        uint256 totalShares
    ) internal pure returns (uint256) {
        if (totalShares == 0 || amountIn == 0) {
            return amountIn;
        }

        uint256 totalSharesIn = totalShares * amountIn;
        if (roundUp) {
            return (totalSharesIn + inSupply - 1) / inSupply;
        } else {
            return totalSharesIn / inSupply;
        }
    }

    /**
     * @dev Calculates the exit fee amount based on the spent in amount
     * @param spentInAmount Amount of tokens spent in the stream
     * @return feeAmount The calculated fee amount
     * @return remainingAmount The remaining amount after fee deduction
     */
    function calculateExitFee(
        uint256 spentInAmount,
        uint256 exitFeePercent
    ) internal pure returns (uint256 feeAmount, uint256 remainingAmount) {
        uint256 decimalExitFee = exitFeePercent;
        uint256 decimalSpentIn = DecimalMath.fromNumber(spentInAmount);
        console.log("decimalSpentIn", decimalSpentIn);

        // Calculate exit fee amount using DecimalMath
        uint256 exitFeeAmount = DecimalMath.mul(decimalSpentIn, decimalExitFee);
        console.log("exitFeeAmount", exitFeeAmount);
        feeAmount = DecimalMath.floor(exitFeeAmount);
        console.log("feeAmount", feeAmount);
        remainingAmount = spentInAmount - feeAmount;
        console.log("remainingAmount", remainingAmount);

        return (feeAmount, remainingAmount);
    }

    function syncPosition(
        PositionTypes.Position memory position,
        uint256 distIndex,
        uint256 shares,
        uint256 inSupply,
        uint256 nowTime
    ) internal pure returns (PositionTypes.Position memory) {
        // Create a new position in memory to store the updated values
        PositionTypes.Position memory updatedPosition = PositionTypes.Position({
            inBalance: position.inBalance,
            shares: position.shares,
            index: position.index,
            lastUpdateTime: position.lastUpdateTime,
            pendingReward: position.pendingReward,
            spentIn: position.spentIn,
            purchased: position.purchased,
            exitDate: position.exitDate
        });

        // Calculate index difference for distributions since last update
        uint256 indexDiff = distIndex - updatedPosition.index;
        uint256 spent = 0;
        uint256 purchased = 0;

        // Only process if there are shares in the stream
        if (shares > 0) {
            // Calculate purchased amount based on position shares and index difference
            uint256 positionPurchased = (updatedPosition.shares * indexDiff) / 1e18 + updatedPosition.pendingReward;
            // Calculate remaining balance based on current shares ratio
            uint256 inRemaining = (inSupply * updatedPosition.shares) / shares;
            // Calculate spent amount
            spent = updatedPosition.inBalance - inRemaining;
            updatedPosition.spentIn += spent;
            updatedPosition.inBalance = inRemaining;

            // Update purchased amount
            purchased = positionPurchased;
            updatedPosition.purchased += purchased;
        }

        // Update position tracking
        updatedPosition.index = distIndex;
        updatedPosition.lastUpdateTime = nowTime;

        return updatedPosition;
    }
}
