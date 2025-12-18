// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title StandardERC20
 * @notice Standard ERC20 token with custom decimals and initial minting
 * @dev Fully compliant with ERC20 standard, supports custom decimals like USDC (6 decimals)
 */
contract StandardERC20 is ERC20 {
    uint8 private immutable _decimalsOverride;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address[] memory recipients,
        uint256[] memory amounts,
        bytes32 /* salt */
    ) ERC20(name_, symbol_) {
        require(recipients.length == amounts.length, "Length mismatch");
        _decimalsOverride = decimals_;

        // Mint initial supply to specified recipients
        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] > 0) {
                _mint(recipients[i], amounts[i]);
            }
        }
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimalsOverride;
    }
}


