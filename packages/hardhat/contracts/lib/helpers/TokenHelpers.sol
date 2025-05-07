// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../../interfaces/IERC20.sol";
import "../../interfaces/IStreamErrors.sol";

library TokenHelpers {
    /**
     * @dev Checks if an address is a valid ERC20 token
     * @param tokenAddress The token address to validate
     * @param testAccount The account to use for testing the token interface
     * @return isValid True if the address implements the ERC20 interface
     */
    function isValidERC20(address tokenAddress, address testAccount) internal view returns (bool isValid) {
        if (tokenAddress == address(0)) {
            return false;
        }

        try IERC20(tokenAddress).balanceOf(testAccount) returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Checks if an account has sufficient token balance
     * @param tokenAddress The ERC20 token address
     * @param account The account to check balance for
     * @param requiredAmount The minimum required balance
     * @return hasEnoughBalance True if the account has sufficient balance
     */
    function hasEnoughBalance(
        address tokenAddress,
        address account,
        uint256 requiredAmount
    ) internal view returns (bool) {
        try IERC20(tokenAddress).balanceOf(account) returns (uint256 balance) {
            return balance >= requiredAmount;
        } catch Error(string memory) {
            return false;
        } catch {
            return false;
        }
    }

    /**
     * @dev Safely transfers tokens from the contract to a recipient
     * @param tokenAddress Address of the token to transfer
     * @param recipient Address of the recipient
     * @param amount Amount of tokens to transfer
     * @return bool True if the transfer was successful
     */
    function safeTokenTransfer(address tokenAddress, address recipient, uint256 amount) internal returns (bool) {
        if (amount == 0 || recipient == address(0)) {
            return true;
        }

        IERC20 token = IERC20(tokenAddress);
        bool success = token.transfer(recipient, amount);
        if (!success) {
            revert IStreamErrors.PaymentFailed();
        }
        return true;
    }

    /**
     * @dev Safely approves a token allowance
     * @param tokenAddress The address of the token to approve
     * @param spender The address to approve the allowance to
     * @param amount The amount of tokens to approve
     * @return bool True if the approval was successful
     */
    function safeTokenApprove(address tokenAddress, address spender, uint256 amount) internal returns (bool) {
        IERC20 token = IERC20(tokenAddress);
        bool success = token.approve(spender, amount);
        if (!success) {
            revert IStreamErrors.PaymentFailed();
        }
    }
}
