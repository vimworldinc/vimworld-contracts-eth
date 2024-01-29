// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract POWA is Ownable, ERC20Burnable {
    /// @notice Indicates whether the address has mint permissions.
    mapping(address => bool) public minters;

    event EventSetMinter(address minter);
    event EventUnsetMinter(address minter);

    /// @dev Throws if called by an account without minting permissions.
    modifier onlyMinter() {
        require(minters[_msgSender()], "Minter only");
        _;
    }

    /// @dev Initializes the POWA contract.
    constructor() ERC20("POWA", "POWA") {}

    /// @notice Mints POWA tokens.
    /// @dev The caller must be a `minter`.
    /// @param to_ Receiving token account.
    /// @param amount_ The number of tokens to be minted.
    function mint(address to_, uint256 amount_) external onlyMinter {
        require(amount_ > 0, "Invalid zero amount");

        _mint(to_, amount_);
    }

    /**
     * @notice Set an address to have mint permissions.
     * @param account_ The address to set as a minter.
     */
    function setMinter(address account_) external onlyOwner {
        require(account_ != address(0), "Invalid zero address");
        minters[account_] = true;

        emit EventSetMinter(account_);
    }

    /**
     * @notice Unset the address's minting permission.
     * @param account_ The address to unset.
     */
    function unsetMinter(address account_) external onlyOwner {
        require(account_ != address(0), "Invalid zero address");
        minters[account_] = false;

        emit EventUnsetMinter(account_);
    }
}
