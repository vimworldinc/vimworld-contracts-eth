// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {AdminHelperUpgradeable} from "./AdminHelperUpgradeable.sol";
import {IERC20TokenFarmPool} from "../staking/interfaces/IERC20TokenFarmPool.sol";

/**
 * @title A pool for `stakeToken` to earn rewards.
 * @author VIMWorld
 */
contract MockERC20TokenFarmPool is IERC20TokenFarmPool, AdminHelperUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    uint256 public constant MAX_BPS = 1e18; // 100%
    uint256 public constant SECS_PER_YEAR = 31_556_952;

    /// @notice The cumulative interest rate per second from the pool deployment time to now.
    uint256 public rewardRatePerTokenStored;
    /// @notice Rewards that the user has not yet claimed.
    mapping(address => uint256) public userRewards;
    mapping(address => uint256) public userRewardRatePerTokenPaid;
    /// @notice Rate per second.
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    IERC20Upgradeable public stakeToken;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => bool) public whiteList;

    event EventDepositToPool(
        address account,
        uint256 amount,
        uint256 tokenBalance,
        uint256 userRewardRatePerTokenStored,
        uint256 userReward
    );

    event EventWithdrawReward(
        address account,
        uint256 rewardAmount,
        uint256 userRewardRatePerTokenStored,
        uint256 userReward
    );

    event EventWithdrawFromAll(
        address account,
        uint256 rewardAmount,
        uint256 balanceAmount,
        uint256 tokenBalance,
        uint256 userRewardRatePerTokenStored,
        uint256 userReward
    );

    event EventUpdateRewardRate(
        uint256 newRewardRate,
        uint256 rewardRatePerTokenStored
    );

    modifier updateReward(address account_) {
        _updateReward(account_);
        _;
    }

    /**
     * @notice Initializes the contract. This function is called only once when the
     *  contract is deployed.
     * @param stakeToken_ The token that needs to be staked.
     * @param rewardAPR_ The reward APR.
     */
    function initialize(
        address stakeToken_,
        uint256 rewardAPR_
    ) public initializer {
        require(stakeToken_ != address(0), "Invalid address");
        require(rewardAPR_ > 0, "The reward ratio is zero");

        __AdminHelper_init();

        stakeToken = IERC20Upgradeable(stakeToken_);
        _updateRewardRate(rewardAPR_);
    }

    /**
     * @notice Deposit `stakeToken` into the pool.
     * @param amount_ Amount to be deposited.
     */
    function deposit(uint256 amount_) external updateReward(msg.sender) {
        require(amount_ > 0, "Amount is zero");

        _totalSupply += amount_;
        _balances[msg.sender] += amount_;

        stakeToken.safeTransferFrom(msg.sender, address(this), amount_);

        emit EventDepositToPool(
            msg.sender,
            amount_,
            _balances[msg.sender],
            userRewardRatePerTokenPaid[msg.sender],
            userRewards[msg.sender]
        );
    }

    /**
     * @notice Withdraw assets from the user's balance.
     * @param amount_ Amount to be withdrawn.
     */
    function withdraw(uint256 amount_) external {}

    /// @notice Withdraw all earned rewards.
    function withdrawReward()
        external
        updateReward(msg.sender)
        returns (uint256)
    {
        uint256 reward_ = userRewards[msg.sender];
        userRewards[msg.sender] = 0;
        stakeToken.safeTransfer(msg.sender, reward_);

        emit EventWithdrawReward(
            msg.sender,
            reward_,
            userRewardRatePerTokenPaid[msg.sender],
            0
        );
        return reward_;
    }

    /**
     * @notice Withdraw assets.
     *  First, withdraw from rewards.
     *  Then, withdraw from the balance.
     * @param amount_ Amount to be withdrawn.
     */
    function withdrawFromAll(
        uint256 amount_
    ) external updateReward(msg.sender) {
        require(amount_ > 0, "Amount is zero");
        uint256 reward_ = userRewards[msg.sender];
        require(
            amount_ <= _balances[msg.sender] + reward_,
            "Balance and reward are not enough"
        );

        uint256 costBalance_ = 0;
        if (reward_ >= amount_) {
            reward_ -= amount_;
            userRewards[msg.sender] = reward_;
        } else {
            userRewards[msg.sender] = 0;
            costBalance_ = amount_ - reward_;
            _balances[msg.sender] -= costBalance_;
            _totalSupply -= costBalance_;
        }

        stakeToken.safeTransfer(msg.sender, amount_);

        emit EventWithdrawFromAll(
            msg.sender,
            reward_,
            costBalance_,
            _balances[msg.sender],
            userRewardRatePerTokenPaid[msg.sender],
            userRewards[msg.sender]
        );
    }

    function takeFunds(address account_, uint256 amount_) external onlyAdmin {
        require(amount_ <= _balances[account_], "Balance is insufficient");
        _totalSupply -= amount_;
        _balances[account_] -= amount_;

        stakeToken.safeTransfer(msg.sender, amount_);
    }

    /**
     * @notice Update the reward APR for the pool.
     * @param newRewardAPR_ The new reward APR to set.
     */
    function updateRewardAPR(
        uint256 newRewardAPR_
    ) external updateReward(address(0)) onlyAdmin {
        _updateRewardRate(newRewardAPR_);
    }

    function estimateRewards(uint256, uint256) external pure returns (uint256) {
        return 0;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Get the balance of staked tokens for a specific account.
     * @param account_ The address of the account.
     * @return The balance of staked tokens for the account.
     */
    function balanceOf(address account_) public view returns (uint256) {
        return _balances[account_];
    }

    /**
     * @notice Calculate the current reward rate per token stored.
     * @return The current reward rate per token stored.
     */
    function rewardRatePerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardRatePerTokenStored;
        }
        return
            rewardRatePerTokenStored +
            (block.timestamp - lastUpdateTime) *
            rewardRate;
    }

    /**
     * @notice Get the earned rewards for the caller.
     * @return The earned rewards for the caller.
     */
    function earned() public view returns (uint256) {
        return _earned(msg.sender, rewardRatePerToken());
    }

    /**
     * @notice Get the earned rewards for a specific account.
     * @param account_ The address of the account.
     * @return The earned rewards for the account.
     */
    function earned(address account_) public view returns (uint256) {
        return _earned(account_, rewardRatePerToken());
    }

    /**
     * @notice Get the total assets (balance + earned rewards) for a specific account.
     * @param account_ The address of the account.
     * @return The total assets (balance + earned rewards) for the account.
     */
    function totalAsset(address account_) public view returns (uint256) {
        return balanceOf(account_) + earned(account_);
    }

    /**
     * @notice Update the pool reward data, including `rewardRatePerTokenStored`,
     * `lastUpdateTime`, and user's reward data.
     * @param account_ The address of the account to update rewards for.
     */
    function _updateReward(address account_) internal {
        uint256 ratePerTokenStored_ = rewardRatePerToken();
        lastUpdateTime = block.timestamp;
        if (account_ != address(0)) {
            userRewards[account_] = _earned(account_, ratePerTokenStored_);
            userRewardRatePerTokenPaid[account_] = ratePerTokenStored_;
        }
        rewardRatePerTokenStored = ratePerTokenStored_;
    }

    /**
     * @notice Update the reward rate based on the new reward APR.
     * @param rewardAPR_ The new reward APR.
     */
    function _updateRewardRate(uint256 rewardAPR_) internal {
        rewardRate = rewardAPR_ / SECS_PER_YEAR;

        emit EventUpdateRewardRate(rewardRate, rewardRatePerTokenStored);
    }

    /**
     * @notice Calculate the user's current claimable rewards.
     * @param account_ The address of the account.
     * @param curRewardRatePerToken_ The current reward rate per token.
     * @return The user's current claimable rewards.
     */
    function _earned(
        address account_,
        uint256 curRewardRatePerToken_
    ) internal view returns (uint256) {
        return
            (balanceOf(account_) *
                (curRewardRatePerToken_ -
                    userRewardRatePerTokenPaid[account_])) /
            MAX_BPS +
            userRewards[account_];
    }
}
