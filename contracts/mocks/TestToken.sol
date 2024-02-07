// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20, ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract TestToken is Ownable, ERC20Burnable {
    constructor(uint256 totalSupply_, address owner_) ERC20("TEST", "TEST") {
        require(owner_ != address(0));

        _mint(owner_, totalSupply_);
    }
}
