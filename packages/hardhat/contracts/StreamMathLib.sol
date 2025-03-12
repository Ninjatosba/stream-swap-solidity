pragma solidity ^0.8.0;

import "./StreamTypes.sol";


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
        if (currentStatus == IStreamTypes.Status.Cancelled || 
            currentStatus == IStreamTypes.Status.Finalized) {
            return currentStatus;
        }
        

        // Update status based on current timestamp
        if (currentTime < bootstrappingStartTime) {
            return IStreamTypes.Status.Waiting;
        } 
        else if (currentTime >= bootstrappingStartTime && 
                 currentTime < streamStartTime) {
            return IStreamTypes.Status.Bootstrapping;
        }
        else if (currentTime >= streamStartTime && 
                 currentTime < streamEndTime) {
            return IStreamTypes.Status.Active;
        }
        else if (currentTime >= streamEndTime) {
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

}