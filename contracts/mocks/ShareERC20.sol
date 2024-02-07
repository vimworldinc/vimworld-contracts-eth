// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {Initializable, ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IShareERC20} from "./IShareERC20.sol";

/**
 * @dev Implementation of the {IERC20} interface.
 *
 */
abstract contract ShareERC20 is
    Initializable,
    ContextUpgradeable,
    IERC20Upgradeable,
    IERC20MetadataUpgradeable,
    IShareERC20
{
    using SafeMath for uint256;
    using Address for address;

    mapping(address => uint256) private _shares;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalShare;

    string private _name;
    string private _symbol;

    function __ShareERC20_init(
        string memory name_,
        string memory symbol_
    ) internal onlyInitializing {
        __ShareERC20_init_unchained(name_, symbol_);
    }

    function __ShareERC20_init_unchained(
        string memory name_,
        string memory symbol_
    ) internal onlyInitializing {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     */
    function decimals() public pure returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _getTotalPooledTokenBalance();
    }

    /**
     * @return the entire amount of APE controlled by the protocol.
     *
     * @dev The sum of all APE balances in the protocol, equals to the total supply of PsAPE.
     */
    function getTotalPooledTokenBalance() public view returns (uint256) {
        return _getTotalPooledTokenBalance();
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(
        address account_
    ) public view virtual override returns (uint256) {
        return getPooledTokenByShares(_sharesOf(account_));
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(
        address recipient_,
        uint256 amount_
    ) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient_, amount_);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(
        address owner_,
        address spender_
    ) public view virtual override returns (uint256) {
        return _allowances[owner_][spender_];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(
        address spender_,
        uint256 amount_
    ) public virtual override returns (bool) {
        _approve(_msgSender(), spender_, amount_);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20};
     *
     * Requirements:
     * - `sender_` and `recipient_` cannot be the zero address.
     * - `sender_` must have a balance of at least `amount_`.
     * - the caller must have allowance for ``sender_``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address sender_,
        address recipient_,
        uint256 amount_
    ) public virtual override returns (bool) {
        _transfer(sender_, recipient_, amount_);
        if (sender_ != _msgSender()) {
            _approve(
                sender_,
                _msgSender(),
                _allowances[sender_][_msgSender()].sub(
                    amount_,
                    "TRANSFER_AMOUNT_EXCEEDS_ALLOWANCE"
                )
            );
        }
        return true;
    }

    /**
     * @notice Moves `sharesAmount_` token shares from the caller's account to the `recipient_` account.
     *
     * @return amount of transferred tokens.
     * Emits a `TransferShares` event.
     * Emits a `Transfer` event.
     *
     * Requirements:
     *
     * - `recipient_` cannot be the zero address.
     * - the caller must have at least `sharesAmount_` shares.
     * - the contract must not be paused.
     *
     * @dev The `sharesAmount_` argument is the amount of shares, not tokens.
     */
    function transferShares(
        address recipient_,
        uint256 sharesAmount_
    ) public returns (uint256) {
        require(recipient_ != address(0), "transfer to the zero address");

        _transferShares(msg.sender, recipient_, sharesAmount_);
        emit TransferShares(msg.sender, recipient_, sharesAmount_);
        uint256 tokensAmount_ = getPooledTokenByShares(sharesAmount_);
        emit Transfer(msg.sender, recipient_, tokensAmount_);
        return tokensAmount_;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(
        address spender_,
        uint256 addedValue_
    ) public virtual returns (bool) {
        _approve(
            _msgSender(),
            spender_,
            _allowances[_msgSender()][spender_].add(addedValue_)
        );
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender_` cannot be the zero address.
     * - `spender_` must have allowance for the caller of at least
     * `subtractedValue_`.
     */
    function decreaseAllowance(
        address spender_,
        uint256 subtractedValue_
    ) public virtual returns (bool) {
        _approve(
            _msgSender(),
            spender_,
            _allowances[_msgSender()][spender_].sub(
                subtractedValue_,
                "DECREASED_ALLOWANCE_BELOW_ZERO"
            )
        );
        return true;
    }

    /**
     * @return the total amount of shares in existence.
     *
     * @dev The sum of all accounts' shares can be an arbitrary number, therefore
     * it is necessary to store it in order to calculate each account's relative share.
     */
    function getTotalShares() public view returns (uint256) {
        return _getTotalShares();
    }

    /**
     * @return the amount of shares owned by `account_`.
     */
    function sharesOf(address account_) public view returns (uint256) {
        return _sharesOf(account_);
    }

    /**
     * @return the amount of shares that corresponds to `amount` protocol-controlled Ape.
     */
    function getShareByPooledToken(
        uint256 amount_
    ) public view returns (uint256) {
        uint256 totalPooledToken_ = _getTotalPooledTokenBalance();
        if (totalPooledToken_ == 0) {
            return 0;
        } else {
            return (amount_ * _getTotalShares()) / totalPooledToken_;
        }
    }

    /**
     * @return the amount of ApeCoin that corresponds to `sharesAmount_` token shares.
     */
    function getPooledTokenByShares(
        uint256 sharesAmount_
    ) public view returns (uint256) {
        uint256 totalShares_ = _getTotalShares();
        if (totalShares_ == 0) {
            return 0;
        } else {
            return
                sharesAmount_.mul(_getTotalPooledTokenBalance()).div(
                    totalShares_
                );
        }
    }

    /**
     * @return the total amount (in wei) of APE controlled by the protocol.
     * @dev This is used for calculating tokens from shares and vice versa.
     * @dev This function is required to be implemented in a derived contract.
     */
    function _getTotalPooledTokenBalance()
        internal
        view
        virtual
        returns (uint256);

    /**
     * @dev Moves tokens `amount_` from `sender_` to `recipient_`.
     *
     * This is internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `sender_` cannot be the zero address.
     * - `recipient_` cannot be the zero address.
     * - `sender_` must have a balance of at least `amount_`.
     */
    function _transfer(
        address sender_,
        address recipient_,
        uint256 amount_
    ) internal virtual {
        require(sender_ != address(0), "transfer from the zero address");
        require(recipient_ != address(0), "transfer to the zero address");

        uint256 sharesToTransfer_ = getShareByPooledToken(amount_);
        _transferShares(sender_, recipient_, sharesToTransfer_);
        emit TransferShares(sender_, recipient_, sharesToTransfer_);
        emit Transfer(sender_, recipient_, amount_);
    }

    /**
     * @dev Sets `amount_` as the allowance of `spender_` over the `owner_`s tokens.
     *
     * This is internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner_` cannot be the zero address.
     * - `spender_` cannot be the zero address.
     */
    function _approve(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal virtual {
        require(owner_ != address(0), "approve from the zero address");
        require(spender_ != address(0), "approve to the zero address");

        _allowances[owner_][spender_] = amount_;
        emit Approval(owner_, spender_, amount_);
    }

    /**
     * @return the total amount of shares in existence.
     */
    function _getTotalShares() internal view returns (uint256) {
        return _totalShare;
    }

    /**
     * @return the amount of shares owned by `account_`.
     */
    function _sharesOf(address account_) internal view returns (uint256) {
        return _shares[account_];
    }

    /**
     * @notice Moves `sharesAmount_` shares from `sender_` to `recipient_`.
     *
     * Requirements:
     *
     * - `sender_` cannot be the zero address.
     * - `recipient_` cannot be the zero address.
     * - `sender_` must hold at least `sharesAmount_` shares.
     * - the contract must not be paused.
     */
    function _transferShares(
        address sender_,
        address recipient_,
        uint256 sharesAmount_
    ) internal {
        _shares[sender_] = _shares[sender_].sub(
            sharesAmount_,
            "transfer amount exceeds balance"
        );
        _shares[recipient_] = _shares[recipient_].add(sharesAmount_);
    }

    /** @dev Creates `amount_` tokens and assigns them to `account_`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account_` cannot be the zero address.
     */
    function _mint(address account_, uint256 amount_) internal virtual {
        require(account_ != address(0), "ERC20: mint to the zero address");

        uint256 _sharesToMint = getShareByPooledToken(amount_);
        if (_sharesToMint == 0) {
            _sharesToMint = amount_;
        }
        _mintShare(account_, _sharesToMint);
        emit TransferShares(address(0), account_, _sharesToMint);
        emit Transfer(address(0), account_, amount_);
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     */
    function _mintShare(
        address account_,
        uint256 sharesAmount_
    ) internal virtual {
        require(account_ != address(0), "mint to the zero address");

        _totalShare = _totalShare.add(sharesAmount_);
        _shares[account_] = _shares[account_].add(sharesAmount_);
    }

    /**
     * @dev Destroys `sharesAmount_` tokens from `account_`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements
     *
     * - `account_` cannot be the zero address.
     * - `account_` must have at least `sharesAmount_` tokens.
     */
    function _burnShare(
        address account_,
        uint256 sharesAmount_
    ) internal virtual {
        require(account_ != address(0), "burn from the zero address");

        _shares[account_] = _shares[account_].sub(
            sharesAmount_,
            "burn amount exceeds balance"
        );
        _totalShare = _totalShare.sub(sharesAmount_);
    }

    uint256[45] private __gap;
}
