// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ShareERC20} from "./ShareERC20.sol";
import {AdminHelperUpgradeable} from "./AdminHelperUpgradeable.sol";

contract TestLido is ShareERC20, AdminHelperUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bool public isPaused;
    uint256 public extraAmount;
    uint256 public reportTime;

    // Records a deposit made by a user
    event Submitted(address indexed sender, uint256 amount, address referral);
    event HandleReport(
        uint256 newExtraAmount,
        uint256 amount,
        uint256 reportTime,
        uint256 apr
    );

    function initialize(
        string memory name_,
        string memory symbol_
    ) public initializer {
        __AdminHelper_init();
        __ShareERC20_init(name_, symbol_);
    }

    /**
     * @notice Send funds to the pool with an optional _referral parameter
     * @dev This function is an alternative way to submit funds. It supports an optional referral address.
     * @return Amount of StETH shares generated
     */
    function submit(address _referral) external payable returns (uint256) {
        return _submit(_referral);
    }

    function transferToVault(
        address account_,
        address token_
    ) external onlyAdmin {
        require(account_ != address(0), "RECOVER_VAULT_ZERO");

        uint256 balance;
        if (token_ == address(0)) {
            balance = address(this).balance;
            // Transfer replaced by call to prevent transfer gas amount issue
            (bool os, ) = account_.call{value: balance}("");
            require(os, "RECOVER_TRANSFER_FAILED");
        } else {
            IERC20Upgradeable token = IERC20Upgradeable(token_);
            balance = token.balanceOf(address(this));
            // safeTransfer comes from the overridden default implementation
            token.safeTransfer(account_, balance);
        }
    }

    /**
     * @notice Report reward, increase asset.
     * @param apr_ The report's APR, 100% = 10000.
     */
    function handleReport(uint256 apr_) external onlyAdmin {
        require(apr_ >= 10, "The apr is too low");
        require(apr_ <= 500, "The apr is too high");
        require(
            block.timestamp - 20 * 3600 >= reportTime,
            "Time interval too short"
        );
        uint256 totalBalance_ = _getTotalPooledTokenBalance();
        uint256 rewardAmount_ = (totalBalance_ * apr_) / 3652425;
        extraAmount += rewardAmount_;
        reportTime = block.timestamp;

        emit HandleReport(extraAmount, rewardAmount_, block.timestamp, apr_);
    }

    function setExtraAmount(uint256 amount_) external onlyAdmin {
        extraAmount = amount_;
    }

    function submitWithoutToken(uint256 amount_) external onlyAdmin {
        _mint(msg.sender, amount_);
    }

    function getSharesByPooledEth(
        uint256 amount_
    ) public view returns (uint256) {
        return getShareByPooledToken(amount_);
    }

    /**
     * @dev Process user deposit, mint liquid tokens, and increase the pool buffer
     * @param _referral Address of the referral.
     * @return Amount of StETH shares generated
     */
    function _submit(address _referral) internal returns (uint256) {
        require(msg.value != 0, "ZERO_DEPOSIT");
        require(!isPaused, "STAKING_PAUSED");

        uint256 _shareBefore = sharesOf(msg.sender);
        _mint(msg.sender, msg.value);
        uint256 sharesAmount = sharesOf(msg.sender) - _shareBefore;

        emit Submitted(msg.sender, msg.value, _referral);
        return sharesAmount;
    }

    function _getTotalPooledTokenBalance()
        internal
        view
        override
        returns (uint256)
    {
        uint256 totalShare_ = _getTotalShares();
        return totalShare_ + extraAmount;
    }
}
