// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OJEE is ERC20 {
    /// @dev Initializes the OJEE contract.
    /// @param account_ The account to receive OJEE.
    constructor(address account_) ERC20("OJEE", "OJEE") {
        require(account_ != address(0), "Invalid zero address");

        _mint(account_, 10 ** 11 * 1e18);
    }

    /// @notice Burn OJEE tokens.
    /// @param amount_ The number of tokens burned.
    function burn(uint256 amount_) external {
        _burn(msg.sender, amount_);
    }
}
