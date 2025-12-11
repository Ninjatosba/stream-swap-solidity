// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamMathLib
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Core mathematical engine powering StreamSwap's time-based distribution algorithm
 * @dev This library implements the mathematical model that enables StreamSwap's unique
 *      continuous token distribution mechanism. Unlike traditional AMMs or auction models,
 *      StreamSwap calculates distributions based on time progression and participation timing.
 *      
 *      Key Algorithms:
 *      - Time Differential Calculation: Determines distribution progress based on elapsed time
 *      - Share-based Distribution: Calculates proportional token allocation per participant
 *      - Dynamic Price Discovery: Computes real-time pricing based on participation
 *      - Position Synchronization: Updates user positions with accrued distributions
 *      - Exit Fee Computation: Applies configurable fees on successful stream exits
 *      
 *      Mathematical Precision:
 *      - Uses DecimalMath library for 6-decimal precision (1e6)
 *      - Handles edge cases like zero participation and boundary conditions
 *      - Prevents overflow/underflow through careful calculation ordering
 *      - Maintains accuracy across different time scales and token amounts
 */

import { StreamTypes } from "../../types/StreamTypes.sol";
import { DecimalMath, Decimal } from "./DecimalMath.sol";
import { PositionTypes } from "../../types/PositionTypes.sol";
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
    ) internal pure returns (Decimal memory) {
        // If the stream is not started yet or already ended, return 0
        if (currentTimestamp < streamStartTime || lastUpdated >= streamEndTime) {
            return DecimalMath.fromNumber(0);
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
            return DecimalMath.fromNumber(0);
        }
        // Return ratio of time elapsed since last update compared to total remaining time
        return DecimalMath.fromRatio(numerator, denominator);
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
        StreamTypes.Status currentStatus,
        uint256 currentTime,
        uint256 bootstrappingStartTime,
        uint256 streamStartTime,
        uint256 streamEndTime
    ) internal pure returns (StreamTypes.Status) {
        // Don't update if stream is in a final state
        if (
            currentStatus == StreamTypes.Status.Cancelled ||
            currentStatus == StreamTypes.Status.FinalizedRefunded ||
            currentStatus == StreamTypes.Status.FinalizedStreamed
        ) {
            return currentStatus;
        }

        // Update status based on current timestamp
        if (currentTime < bootstrappingStartTime) {
            return StreamTypes.Status.Waiting;
        } else if (currentTime >= bootstrappingStartTime && currentTime < streamStartTime) {
            return StreamTypes.Status.Bootstrapping;
        } else if (currentTime >= streamStartTime && currentTime < streamEndTime) {
            return StreamTypes.Status.Active;
        } else if (currentTime >= streamEndTime) {
            return StreamTypes.Status.Ended;
        }

        // This should never be reached, but return current status as fallback
        return currentStatus;
    }

    /**
     * @dev Normalizes an amount from one decimal scale to another
     * @param amount Raw token amount
     * @param fromDecimals Source token decimals
     * @param toDecimals Target decimals (typically 18 for normalization)
     * @return normalizedAmount Amount normalized to target decimals
     */
    function normalizeAmount(
        uint256 amount,
        uint8 fromDecimals,
        uint8 toDecimals
    ) internal pure returns (uint256 normalizedAmount) {
        if (fromDecimals == toDecimals) {
            return amount;
        }
        
        if (fromDecimals < toDecimals) {
            // Scale up: multiply by 10^(toDecimals - fromDecimals)
            uint256 scaleFactor = 10 ** (toDecimals - fromDecimals);
            return amount * scaleFactor;
        } else {
            // Scale down: divide by 10^(fromDecimals - toDecimals)
            uint256 scaleFactor = 10 ** (fromDecimals - toDecimals);
            return amount / scaleFactor;
        }
    }

    /**
     * @dev Calculates updated stream state based on time difference
     * @param state Current stream state
     * @param diff Time difference in seconds
     * @param inTokenDecimals Decimals of the input token
     * @param outTokenDecimals Decimals of the output token
     * @return Updated stream state
     */
    function calculateUpdatedState(
        StreamTypes.StreamState memory state,
        Decimal memory diff,
        uint8 inTokenDecimals,
        uint8 outTokenDecimals
    ) internal pure returns (StreamTypes.StreamState memory) {
        // Create a copy of the state to avoid modifying the input
        StreamTypes.StreamState memory newState = state;

        if (newState.shares > 0 && diff.value > 0) {
            // Calculate new distribution balance and spent in amount
            Decimal memory newDecimalDistributionBalance = DecimalMath.mul(
                DecimalMath.fromNumber(newState.outRemaining),
                diff
            );
            uint256 newDistributionBalance = DecimalMath.floor(newDecimalDistributionBalance);

            Decimal memory newDecimalSpentIn = DecimalMath.mul(DecimalMath.fromNumber(newState.inSupply), diff);
            uint256 spentIn = DecimalMath.floor(newDecimalSpentIn);

            // Update state variables
            newState.spentIn += spentIn;
            newState.inSupply -= spentIn;

            if (newDistributionBalance > 0) {
                newState.outRemaining -= newDistributionBalance;
                // Increment distribution index
                Decimal memory distIndexIncrementAmount = DecimalMath.fromRatio(
                    newDistributionBalance,
                    newState.shares
                );
                newState.distIndex = DecimalMath.add(newState.distIndex, distIndexIncrementAmount);
                
                // Normalize amounts to same scale (18 decimals) before calculating price
                // This ensures price calculation is correct when tokens have different decimals
                uint256 normalizedSpentIn = normalizeAmount(spentIn, inTokenDecimals, 18);
                uint256 normalizedDistributionBalance = normalizeAmount(newDistributionBalance, outTokenDecimals, 18);
                
                // Update current streamed price (normalized to 18 decimals)
                newState.currentStreamedPrice = DecimalMath.fromRatio(normalizedSpentIn, normalizedDistributionBalance);
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
     * @return exitFeeAmount The calculated fee amount
     * @return remainingAmount The remaining amount after fee deduction
     */
    function calculateExitFee(
        uint256 spentInAmount,
        Decimal memory exitFeeRatio
    ) internal pure returns (uint256 exitFeeAmount, uint256 remainingAmount) {
        Decimal memory decimalSpentIn = DecimalMath.fromNumber(spentInAmount);

        // Calculate exit fee amount using DecimalMath
        Decimal memory decimalExitFeeAmount = DecimalMath.mul(decimalSpentIn, exitFeeRatio);
        exitFeeAmount = DecimalMath.floor(decimalExitFeeAmount);
        remainingAmount = spentInAmount - exitFeeAmount;

        return (exitFeeAmount, remainingAmount);
    }

    function syncPosition(
        PositionTypes.Position memory position,
        Decimal memory distIndex,
        uint256 totalShares,
        uint256 inSupply,
        uint256 nowTime
    ) internal pure returns (PositionTypes.Position memory) {
        // Calculate index difference for distributions since last update
        Decimal memory indexDiff = DecimalMath.sub(distIndex, position.index);
        uint256 spent = 0;
        uint256 purchased = 0;

        // Only process if there are shares in the stream
        if (position.shares > 0) {
            // Calculate purchased amount based on position shares and index difference
            Decimal memory positionSharesDecimal = DecimalMath.fromNumber(position.shares);
            Decimal memory purchasedDecimal = DecimalMath.add(
                DecimalMath.mul(positionSharesDecimal, indexDiff),
                position.pendingReward
            );
            (purchased, purchasedDecimal) = DecimalMath.toNumber(purchasedDecimal);
            position.purchased += purchased;
            position.pendingReward = purchasedDecimal;

            // Calculate remaining balance based on current shares ratio
            uint256 inRemaining = (inSupply * position.shares) / totalShares;
            // Calculate spent amount
            spent = position.inBalance - inRemaining;
            position.spentIn += spent;
            position.inBalance = inRemaining;
        }

        // Update position tracking
        position.index = distIndex;
        position.lastUpdateTime = nowTime;

        return position;
    }
}
