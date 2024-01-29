// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IVault} from "../../interfaces/IVault.sol";
import {IBaseStrategy} from "../interfaces/IBaseStrategy.sol";

/**
 * @title Base generic lender.
 * @author VIMWorld
 * @notice
 *  GenericLenderBase implements the base functionality required for a lending platform.
 */
abstract contract GenericLenderBase is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IVault public vault;
    address public strategy;
    IERC20Upgradeable public want;
    string public lenderName;
    uint256 public dust;

    modifier management() {
        require(
            msg.sender == address(strategy) ||
                msg.sender == vault.governance() ||
                msg.sender == vault.management(),
            "!Management"
        );
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == vault.governance(), "!Governance");
        _;
    }

    function __GenericLenderBase_init(
        address strategy_,
        string memory name_
    ) internal onlyInitializing {
        __GenericLenderBase_init_unchained(strategy_, name_);
    }

    function __GenericLenderBase_init_unchained(
        address strategy_,
        string memory name_
    ) internal onlyInitializing {
        require(address(strategy) == address(0), "Lender already initialized");

        strategy = strategy_;
        vault = IVault(IBaseStrategy(strategy).vault());
        want = IERC20Upgradeable(vault.token());
        lenderName = name_;
        dust = 0;

        want.safeApprove(strategy_, type(uint256).max);
    }

    function setDust(uint256 dust_) external virtual management {
        dust = dust_;
    }

    /**
     * @notice
     *  Removes tokens from this Contract.
     *  This may be used in case of accidentally sending the wrong kind
     *  of token to this Contract.
     *
     *  Tokens will be sent to `governance()`.
     *
     *  This will fail if an attempt is made to sweep any tokens that are
     *  protected by this Strategy.
     *
     * @dev
     *  Implement `_protectedTokens()` to specify any additional tokens that
     *  should be protected from sweeping in addition to `want`.
     * @param token_ The token to transfer out of this contract.
     */
    function sweep(address token_) external virtual management {
        address[] memory protectedTokens_ = _protectedTokens();
        for (uint256 i; i < protectedTokens_.length; i++)
            require(token_ != protectedTokens_[i], "!Protected");

        IERC20Upgradeable(token_).safeTransfer(
            vault.governance(),
            IERC20Upgradeable(token_).balanceOf(address(this))
        );
    }

    /**
     * @notice
     *  Override this to add all tokens/tokenized positions this contract
     *  manages on a persistent basis (e.g. not just for swapping back to
     *  want ephemerally).
     */
    function _protectedTokens()
        internal
        view
        virtual
        returns (address[] memory);

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[45] private __gap;
}
