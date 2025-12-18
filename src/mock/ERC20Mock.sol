// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ERC20Mock
 * @notice Mock ERC20 token with custom decimals for testing
 * @dev Supports custom decimals (default 18) and public mint function
 */
contract ERC20Mock is ERC20 {
    uint8 private immutable _decimalsOverride;

    constructor(string memory _name, string memory _symbol, uint8 decimals_) ERC20(_name, _symbol) {
        _decimalsOverride = decimals_;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimalsOverride;
    }
}
