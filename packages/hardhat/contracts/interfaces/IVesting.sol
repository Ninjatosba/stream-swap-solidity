// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title IVesting
 * @dev Interface for the Vesting contract that manages token vesting schedules
 */
interface IVesting {
    /**
     * @dev Struct representing a vesting schedule for a beneficiary
     */
    struct VestingSchedule {
        uint256 cliffTime;      // Timestamp when cliff period ends
        uint256 endTime;        // Timestamp when vesting period ends
        uint256 totalAmount;    // Total amount to be vested
        uint256 releasedAmount; // Amount already released to beneficiary
    }
    
    /**
     * @dev Stakes funds for vesting to a beneficiary
     * @param beneficiary Address that will receive the vested tokens
     * @param tokenAddress Address of the token being vested
     * @param cliffTime Timestamp after which the first tokens can be withdrawn
     * @param endTime Timestamp when all tokens will be vested
     * @param totalAmount Total amount of tokens to vest
     */
    function stakeFunds(
        address beneficiary,
        address tokenAddress,
        uint256 cliffTime,
        uint256 endTime,
        uint256 totalAmount
    ) external;
    
    /**
     * @dev Withdraws available vested funds for the caller
     * @param tokenAddress Address of the token to withdraw
     * @param scheduleIndex Index of the vesting schedule to withdraw from
     */
    function withdrawFunds(address tokenAddress, uint256 scheduleIndex) external;
    
    /**
     * @dev Retrieves all vesting schedules for a beneficiary for a specific token
     * @param beneficiary Address of the beneficiary
     * @param tokenAddress Address of the token
     * @return Array of vesting schedules
     */
    function getStakesForBeneficiary(
        address beneficiary,
        address tokenAddress
    ) external view returns (VestingSchedule[] memory);
    
    /**
     * @dev Calculates the amount available for withdrawal from a vesting schedule
     * @param vestingSchedule The vesting schedule to check
     * @return The withdrawable amount
     */
    function calculateWithdrawableAmount(VestingSchedule memory vestingSchedule) 
        external 
        view 
        returns (uint256);
}
