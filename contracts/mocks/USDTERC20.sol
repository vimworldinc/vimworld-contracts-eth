// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract USDTERC20 is ERC20Permit {
    constructor(
        uint256 totalSupply_,
        address owner_
    ) ERC20Permit("USDT") ERC20("USDT", "USDT") {
        require(owner_ != address(0));

        _mint(owner_, totalSupply_);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
