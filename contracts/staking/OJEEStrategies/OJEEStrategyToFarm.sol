// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BaseStrategy} from "../base/BaseStrategy.sol";
import {IERC20TokenFarmPool} from "../interfaces/IERC20TokenFarmPool.sol";

/**
 * @title A strategy for `want` to pool.
 * @author VIMWorld
 */
contract OJEEStrategyToFarm is BaseStrategy {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant SECONDSPERYEAR = 31556952;

    IERC20TokenFarmPool public tokenFarmPool;
    uint256 public withdrawalThreshold;

    /**
     * @notice Initializes the Strategy. This function is called only once when the
     * contract is deployed.
     * @param vault_ The address of the Vault responsible for this Strategy.
     * @param tokenFarmPoolAddress_ The address of the FarmPool.
     */
    function initialize(
        address vault_,
        address tokenFarmPoolAddress_
    ) public initializer {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
        __OJEEStrategyToFarm_init_unchained(tokenFarmPoolAddress_);
    }

    function __OJEEStrategyToFarm_init_unchained(
        address tokenFarmPoolAddress_
    ) internal onlyInitializing {
        require(tokenFarmPoolAddress_ != address(0), "Invalid zero address");

        maxReportDelay = 1814400;
        profitFactor = 100;
        debtThreshold = 100000 * 1e18;

        tokenFarmPool = IERC20TokenFarmPool(tokenFarmPoolAddress_);

        IERC20Upgradeable(address(want)).safeApprove(
            tokenFarmPoolAddress_,
            type(uint256).max
        );
    }

    function setWithdrawalThreshold(
        uint256 threshold_
    ) external onlyAuthorized {
        withdrawalThreshold = threshold_;
    }

    function setFarmPool(address pool_) external onlyAuthorized {
        require(pool_ != address(0), "Invalid zero address");
        IERC20Upgradeable(address(want)).safeApprove(address(tokenFarmPool), 0);
        tokenFarmPool = IERC20TokenFarmPool(pool_);
        IERC20Upgradeable(address(want)).safeApprove(pool_, type(uint256).max);
    }

    /**
     * @notice Get the name of the Strategy.
     * @return The name of the Strategy.
     */
    function name() external pure override returns (string memory) {
        return "StrategyOJEEFarmPool";
    }

    /**
     * @notice Provide a signal to the keeper that `harvest()` should be called.
     * @param callCostInWant_ The keeper's estimated gas cost to call `harvest()` (in `want`).
     *
     * The param `callCostInWant_` is different from BaseStrategy's `callCostInWei`.
     * `callCostInWant_` must be priced in terms of `want`.
     * And `callCostInWei` must be priced in terms of `wei` (1e-18 ETH).
     *
     * @return `true` if `harvest()` should be called, `false` otherwise.
     */
    function harvestTrigger(
        uint256 callCostInWant_
    ) public view override returns (bool) {
        return super.harvestTrigger(callCostInWant_);
    }

    /**
     * @notice Convert an amount in ETH to the same amount in the strategy's `want` token.
     * @param amount_ The amount in ETH to convert.
     * @return The equivalent amount in the strategy's `want` token.
     */
    function ethToWant(uint256 amount_) public pure override returns (uint256) {
        return amount_;
    }

    /**
     * @notice Get an estimate of the total assets held by the Strategy.
     * @return The estimated total assets held by the Strategy.
     */
    function estimatedTotalAssets() public view override returns (uint256) {
        return
            tokenFarmPool.totalAsset(address(this)) +
            want.balanceOf(address(this));
    }

    /**
     * @notice Get an estimate of the annual percentage rate (APR) for the Strategy.
     * @return The estimated APR for the Strategy.
     */
    function estimatedAPR() public view returns (uint256) {
        uint256 bal = estimatedTotalAssets();
        if (bal == 0) {
            return 0;
        }

        return tokenFarmPool.balanceOf(address(this)) / bal;
    }

    /**
     * @notice Get the balance and earned rewards held by the Strategy in the pool.
     * @return The balance and earned rewards held by the Strategy in the pool.
     */
    function strategyBalanceAndRewardInPool()
        public
        view
        returns (uint256, uint256)
    {
        return (tokenFarmPool.balanceOf(address(this)), tokenFarmPool.earned());
    }

    /**
     * @notice Prepare for strategy `harvest()` by determining the profit, loss, and debt payment.
     * @dev See {BaseStrategy-_prepareReturn}.
     * @param debtOutstanding_ The outstanding debt of the strategy.
     * @return profit_ The calculated profit amount.
     * @return loss_ The calculated loss amount.
     * @return debtPayment_ The calculated debt payment amount.
     */
    function _prepareReturn(
        uint256 debtOutstanding_
    )
        internal
        override
        returns (uint256 profit_, uint256 loss_, uint256 debtPayment_)
    {
        profit_ = 0;
        loss_ = 0; // Initialize loss to zero for clarity.
        debtPayment_ = debtOutstanding_;

        uint256 rewardAsset_ = tokenFarmPool.withdrawReward();
        uint256 looseAssetsAfterReward_ = want.balanceOf(address(this));
        uint256 poolBalance_ = tokenFarmPool.balanceOf(address(this));

        if (rewardAsset_ + poolBalance_ == 0) {
            // No position to harvest or profit to report.
            if (debtPayment_ > looseAssetsAfterReward_) {
                // We can only return the loose assets available.
                debtPayment_ = looseAssetsAfterReward_;
            }

            return (profit_, loss_, debtPayment_);
        }

        uint256 total_ = looseAssetsAfterReward_ + poolBalance_;
        uint256 debt_ = vault.strategies(address(this)).totalDebt;

        if (total_ > debt_) {
            // The strategy has generated a profit.
            profit_ = total_ - debt_;

            uint256 amountToFree_ = profit_ + debtPayment_;

            // We need to add outstanding to our profit
            // Don't need to do logic if there is nothing to free
            if (amountToFree_ > 0 && looseAssetsAfterReward_ < amountToFree_) {
                // Attempt to withdraw assets if not enough available.
                _withdrawSome(amountToFree_ - looseAssetsAfterReward_);
                uint256 newLoose_ = want.balanceOf(address(this));

                // Adjust debtPayment_ and profit_ if necessary.
                if (newLoose_ < amountToFree_) {
                    if (profit_ > newLoose_) {
                        profit_ = newLoose_;
                        debtPayment_ = 0;
                    } else {
                        debtPayment_ = Math.min(
                            newLoose_ - profit_,
                            debtPayment_
                        );
                    }
                }
            }
        } else {
            // Serious loss should never happen but if it does lets record it accurately.
            loss_ = debt_ - total_;

            uint256 amountToFree_ = loss_ + debtPayment_;

            if (amountToFree_ > 0 && looseAssetsAfterReward_ < amountToFree_) {
                // Attempt to withdraw assets if not enough available.
                _withdrawSome(amountToFree_ - looseAssetsAfterReward_);
                uint256 newLoose_ = want.balanceOf(address(this));

                // Adjust debtPayment_ and loss_ if necessary.
                if (newLoose_ < amountToFree_) {
                    if (loss_ > newLoose_) {
                        loss_ = newLoose_;
                        debtPayment_ = 0;
                    } else {
                        debtPayment_ = Math.min(
                            newLoose_ - loss_,
                            debtPayment_
                        );
                    }
                }
            }
        }
    }

    /**
     * @notice
     *  Invest the `want` balance of the strategy into the pool.
     *  We ignore debt outstanding for an easy life.
     */
    function _adjustPosition(uint256) internal override {
        // emergency exit is dealt with at the beginning of harvest
        if (emergencyExit) {
            return;
        }

        uint256 bal_ = want.balanceOf(address(this));
        if (bal_ > 0) {
            tokenFarmPool.deposit(bal_);
        }
    }

    /**
     * @notice Withdraw `amount_` tokens from the pool.
     * @param amount_ The amount to be withdrawn.
     * @return The amount actually withdrawn.
     */
    function _withdrawSome(uint256 amount_) internal returns (uint256) {
        // don't withdraw dust
        if (amount_ < withdrawalThreshold) {
            return 0;
        }

        tokenFarmPool.withdrawFromAll(amount_);
        return amount_;
    }

    /**
     * @notice Withdraw all tokens from the pool.
     * @return The total amount withdrawn.
     */
    function _withdrawAll() internal returns (uint256) {
        uint256 amount_ = tokenFarmPool.totalAsset(address(this));
        tokenFarmPool.withdrawFromAll(amount_);
        return amount_;
    }

    /**
     * @notice Liquidate a portion of the Strategy's position to free up assets.
     * @param amountNeeded_ The amount of assets needed to cover obligations.
     * @return amountFreed_ The amount of assets freed by liquidation.
     * @return loss_ The calculated loss, if any, resulting from the liquidation.
     */
    function _liquidatePosition(
        uint256 amountNeeded_
    ) internal override returns (uint256 amountFreed_, uint256 loss_) {
        uint256 _balance = want.balanceOf(address(this));

        if (_balance >= amountNeeded_) {
            // If we have enough balance to cover the obligation, no loss.
            // Reserve is set here to prevent sending the entire balance to the withdrawer.
            return (amountNeeded_, 0);
        } else {
            // We don't have enough balance to cover the obligation.
            // Attempt to withdraw some assets from the pool.
            uint256 received = _withdrawSome(amountNeeded_ - _balance) +
                _balance;

            if (received >= amountNeeded_) {
                // If we managed to free enough assets, no loss.
                return (amountNeeded_, 0);
            } else {
                return (received, 0);
            }
        }
    }

    function _liquidateAllPositions() internal override returns (uint256) {
        return _withdrawAll();
    }

    /**
     * @notice Prepare for the migration of the Strategy.
     */
    function _prepareMigration(address) internal override {
        uint256 outstanding_ = vault.strategies(address(this)).totalDebt;
        _prepareReturn(outstanding_);
    }

    function _protectedTokens()
        internal
        pure
        override
        returns (address[] memory)
    {
        return new address[](0);
    }
}
