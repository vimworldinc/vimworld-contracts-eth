// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IUniswapV2Router02} from "../interfaces/uniswap/IUniswapV2Router.sol";
import {IWantToEth} from "../interfaces/IWantToEth.sol";
import {IGenericLender} from "../interfaces/IGenericLender.sol";
import {BaseStrategy} from "../base/BaseStrategy.sol";

/**
 * @title A strategy for USDT to lender.
 * @author VIMWorld
 * @notice
 *   A lender optimization strategy for any ERC-20 asset.
 *
 *   This strategy works by taking plugins designed for standard lending platforms.
 *   It automatically chooses the best yield-generating platform and adjusts accordingly.
 *   The adjustment is suboptimal, so there is an additional option to manually set the position.
 */
contract USDTStrategyToLender is BaseStrategy {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public constant UNISWAP_ROUTER =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint256 public constant SECONDSPERYEAR = 31556952;

    struct LenderRatio {
        address lender;
        //share x 1000
        uint16 share;
    }

    // we could make this more gas efficient but it is only used by a view function
    struct LendStatus {
        string name;
        uint256 assets;
        uint256 rate;
        address add;
    }

    uint256 public withdrawalThreshold;

    IGenericLender[] public lenders;
    address public wantToEthOracle;

    /**
     * @notice
     *  Initializes the Strategy, this is called only once when the
     *  contract is deployed.
     * @param vault_ The address of the Vault responsible for this Strategy.
     */
    function initialize(address vault_) public initializer {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
        __USDTStrategyToLender_init_unchained();
    }

    function __USDTStrategyToLender_init_unchained() internal onlyInitializing {
        maxReportDelay = 1814400;
        profitFactor = 10000;
        debtThreshold = 1000000 * 10 ** 6;
    }

    function setWithdrawalThreshold(
        uint256 threshold_
    ) external onlyAuthorized {
        withdrawalThreshold = threshold_;
    }

    function setPriceOracle(address oracle_) external onlyAuthorized {
        wantToEthOracle = oracle_;
    }

    function name() external pure override returns (string memory) {
        return "StrategyLenderYieldOptimiser";
    }

    /**
     * @notice Add lenders for the strategy to choose from.
     *  Only governance can prevent the strategist from adding questionable lenders.
     */
    function addLender(address lenderAddress_) public onlyGovernance {
        IGenericLender lend_ = IGenericLender(lenderAddress_);
        require(lend_.strategy() == address(this), "Undocked Lender");

        for (uint256 i = 0; i < lenders.length; i++) {
            require(lenderAddress_ != address(lenders[i]), "Already added");
        }
        lenders.push(lend_);
    }

    /**
     * @notice Strategists can remove lenders for safety.
     */
    function safeRemoveLender(address lenderAddress_) public onlyAuthorized {
        _removeLender(lenderAddress_, false);
    }

    function forceRemoveLender(address lenderAddress_) public onlyAuthorized {
        _removeLender(lenderAddress_, true);
    }

    /**
     * @notice Share must add up to 1000. 500 means 50%, etc.
     */
    function manualAllocation(
        LenderRatio[] memory newPositions_
    ) public onlyAuthorized {
        uint256 share_ = 0;

        for (uint256 i = 0; i < lenders.length; i++) {
            lenders[i].withdrawAll();
        }

        uint256 assets = want.balanceOf(address(this));

        for (uint256 i = 0; i < newPositions_.length; i++) {
            bool found_ = false;

            // Might be annoying and expensive to do this second loop but worth it for safety.
            for (uint256 j = 0; j < lenders.length; j++) {
                if (address(lenders[j]) == newPositions_[i].lender) {
                    found_ = true;
                }
            }
            require(found_, "Not lender");

            share_ = share_ + newPositions_[i].share;
            uint256 toSend_ = (assets * newPositions_[i].share) / 1000;
            want.safeTransfer(newPositions_[i].lender, toSend_);
            IGenericLender(newPositions_[i].lender).deposit();
        }

        require(share_ == 1000, "Share!=1000");
    }

    /**
     * @notice See {BaseStrategy-ethToWant}.
     */
    function ethToWant(uint256 amount_) public view override returns (uint256) {
        // Three situations:
        // 1. Currency is ETH, so no change.
        // 2. We use an external oracle.
        // 3. We use Uniswap swap price.

        if (address(want) == _weth()) {
            return amount_;
        } else if (wantToEthOracle != address(0)) {
            return IWantToEth(wantToEthOracle).ethToWant(amount_);
        }

        address[] memory path_ = new address[](2);
        path_[0] = _weth();
        path_[1] = address(want);

        uint256[] memory amounts_ = _uniswapRouter().getAmountsOut(
            amount_,
            path_
        );
        return amounts_[amounts_.length - 1];
    }

    /**
     * @notice See {BaseStrategy-tendTrigger}.
     */
    function tendTrigger(
        uint256 callCost_
    ) public view override returns (bool) {
        // Make sure to call tendTrigger with the same call cost as harvestTrigger.
        if (harvestTrigger(callCost_)) {
            return false;
        }

        // Now let's check if there is a better APR somewhere else.
        // If there is and profit potential is worth changing, then let's do it.
        (
            uint256 lowest_,
            uint256 lowestApr_,
            ,
            uint256 potential_
        ) = estimateAdjustPosition();

        // If potential > lowestApr_, it means we are changing horses.
        if (potential_ > lowestApr_) {
            uint256 nav_ = lenders[lowest_].nav();

            // To calculate our potential profit increase, we work out how much extra
            // we would make in a typical harvest interlude. That is maxReportingDelay
            // then we see if the extra profit is worth more than the gas cost * profitFactor.

            // Safe math not needed here.
            // APR is scaled by 1e18, so we downscale here.
            uint256 profitIncrease_ = (((nav_ *
                potential_ -
                nav_ *
                lowestApr_) / 1e18) * maxReportDelay) / SECONDSPERYEAR;

            uint256 wantCallCost_ = ethToWant(callCost_);

            return (wantCallCost_ * profitFactor < profitIncrease_);
        }
        return false;
    }

    /**
     * @notice Returns the status of all lenders attached to the strategy.
     */
    function lendStatuses() public view returns (LendStatus[] memory) {
        LendStatus[] memory statuses_ = new LendStatus[](lenders.length);
        for (uint256 i = 0; i < lenders.length; i++) {
            LendStatus memory lStatus_;
            lStatus_.name = lenders[i].lenderName();
            lStatus_.add = address(lenders[i]);
            lStatus_.assets = lenders[i].nav();
            lStatus_.rate = lenders[i].apr();
            statuses_[i] = lStatus_;
        }

        return statuses_;
    }

    /**
     * @notice Lent assets plus loose assets.
     */
    function estimatedTotalAssets() public view override returns (uint256) {
        uint256 nav_ = lentTotalAssets();
        nav_ = nav_ + want.balanceOf(address(this));

        return nav_;
    }

    function numLenders() public view returns (uint256) {
        return lenders.length;
    }

    /**
     * @notice The weighted APR of all lenders.
     *  sum(nav * apr) / totalNav.
     */
    function estimatedAPR() public view returns (uint256) {
        uint256 bal_ = estimatedTotalAssets();
        if (bal_ == 0) {
            return 0;
        }

        uint256 weightedAPR_ = 0;

        for (uint256 i = 0; i < lenders.length; i++) {
            weightedAPR_ = weightedAPR_ + lenders[i].weightedApr();
        }

        return weightedAPR_ / bal_;
    }

    /**
     * @notice Estimates the lenders with the highest and lowest APR.
     *  Public for debugging purposes but not very useful to the general public.
     */
    function estimateAdjustPosition()
        public
        view
        returns (
            uint256 lowest_,
            uint256 lowestApr_,
            uint256 highest_,
            uint256 potential_
        )
    {
        // All loose assets are to be invested.
        uint256 looseAssets_ = want.balanceOf(address(this));

        // Our simple algo
        // Get the lowest APR strat.
        // Cycle through and see who could take its funds plus want for the highest APR.
        lowestApr_ = type(uint256).max;
        lowest_ = 0;
        uint256 lowestNav_ = 0;
        for (uint256 i = 0; i < lenders.length; i++) {
            if (lenders[i].hasAssets()) {
                uint256 apr_ = lenders[i].apr();
                if (apr_ < lowestApr_) {
                    lowestApr_ = apr_;
                    lowest_ = i;
                    lowestNav_ = lenders[i].nav();
                }
            }
        }

        uint256 toAdd_ = lowestNav_ + looseAssets_;

        uint256 highestApr_ = 0;
        highest_ = 0;

        for (uint256 i = 0; i < lenders.length; i++) {
            uint256 apr_;
            apr_ = lenders[i].aprAfterDeposit(looseAssets_);

            if (apr_ > highestApr_) {
                highestApr_ = apr_;
                highest_ = i;
            }
        }

        // If we can improve APR by withdrawing, we do so.
        potential_ = lenders[highest_].aprAfterDeposit(toAdd_);
    }

    /**
     * @notice Provides an estimate of future APR with a change in the debt limit.
     *  Useful for governance when deciding on debt limits.
     */
    function estimatedFutureAPR(
        uint256 newDebtLimit_
    ) public view returns (uint256) {
        uint256 oldDebtLimit_ = vault.strategies(address(this)).totalDebt;
        uint256 change_;
        if (oldDebtLimit_ < newDebtLimit_) {
            change_ = newDebtLimit_ - oldDebtLimit_;
            return _estimateDebtLimitIncrease(change_);
        } else {
            change_ = oldDebtLimit_ - newDebtLimit_;
            return _estimateDebtLimitDecrease(change_);
        }
    }

    /**
     * @notice Iterate through all lenders and withdraw all loose tokens.
     *  Use this function to free up capital when not lending.
     */
    function lentTotalAssets() public view returns (uint256) {
        uint256 nav_ = 0;
        for (uint256 i = 0; i < lenders.length; i++) {
            nav_ = nav_ + lenders[i].nav();
        }
        return nav_;
    }

    /**
     * @notice We need to free up profit plus `debtOutstanding_`.
     *  If debtOutstanding_ is more than we can free, we get as much as possible.
     *  There should be no way for there to be a loss.
     * @param debtOutstanding_ The debtOutstanding that we need to free.
     */
    function _prepareReturn(
        uint256 debtOutstanding_
    )
        internal
        override
        returns (uint256 profit_, uint256 loss_, uint256 debtPayment_)
    {
        profit_ = 0;
        loss_ = 0;
        debtPayment_ = debtOutstanding_;

        uint256 lentAssets_ = lentTotalAssets();

        uint256 looseAssets_ = want.balanceOf(address(this));

        uint256 total_ = looseAssets_ + lentAssets_;

        if (lentAssets_ == 0) {
            // No position to harvest or profit to report
            if (debtPayment_ > looseAssets_) {
                // We can only return looseAssets_
                debtPayment_ = looseAssets_;
            }

            return (profit_, loss_, debtPayment_);
        }

        uint256 debt_ = vault.strategies(address(this)).totalDebt;

        if (total_ > debt_) {
            profit_ = total_ - debt_;

            uint256 amountToFree_ = profit_ + debtPayment_;
            // We need to add outstanding to our profit.
            // Dont need to do logic if there is nothiing to free.
            if (amountToFree_ > 0 && looseAssets_ < amountToFree_) {
                // Withdraw what we can withdraw.
                _withdrawSome(amountToFree_ - looseAssets_);
                uint256 newLoose_ = want.balanceOf(address(this));

                // If we dont have enough money adjust debtOutstanding_ and only change profit if needed.
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

            if (amountToFree_ > 0 && looseAssets_ < amountToFree_) {
                // Withdraw what we can withdraw.
                _withdrawSome(amountToFree_ - looseAssets_);
                uint256 newLoose_ = want.balanceOf(address(this));

                // If we dont have enough money adjust debtOutstanding_ and only change profit if needed.
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
     *  The algorithm moves assets from lowest return to highest,
     *  like a very slow idiots bubble sort.
     *  We ignore debt outstanding for an easy life.
     */
    function _adjustPosition(uint256) internal override {
        // Emergency exit is dealt with at beginning of harvest
        if (emergencyExit) {
            return;
        }

        // We just keep all money in want if we dont have any lenders
        if (lenders.length == 0) {
            return;
        }

        (
            uint256 lowest_,
            uint256 lowestApr_,
            uint256 highest_,
            uint256 potential_
        ) = estimateAdjustPosition();

        if (potential_ > lowestApr_) {
            // APR should go down after deposit so wont be withdrawing from self
            lenders[lowest_].withdrawAll();
        }

        uint256 bal_ = want.balanceOf(address(this));
        if (bal_ > 0) {
            want.safeTransfer(address(lenders[highest_]), bal_);
            lenders[highest_].deposit();
        }
    }

    /**
     * @notice Cycle through withdrawals starting with the worst rate.
     * @param amount_ The amount to be withdrawn.
     * @return amountWithdrawn_ The amount of 'want' that was withdrawn.
     */
    function _withdrawSome(
        uint256 amount_
    ) internal returns (uint256 amountWithdrawn_) {
        if (lenders.length == 0) {
            return 0;
        }

        // Avoid withdrawing insignificant amounts
        if (amount_ < withdrawalThreshold) {
            return 0;
        }

        amountWithdrawn_ = 0;
        // In most situations, this will only run once. Only significant withdrawals will consume substantial gas.
        uint256 idx_ = 0;
        while (amountWithdrawn_ < amount_) {
            uint256 lowestApr_ = type(uint256).max;
            uint256 lowest_ = 0;
            for (uint256 i = 0; i < lenders.length; i++) {
                if (lenders[i].hasAssets()) {
                    uint256 apr = lenders[i].apr();
                    if (apr < lowestApr_) {
                        lowestApr_ = apr;
                        lowest_ = i;
                    }
                }
            }
            if (!lenders[lowest_].hasAssets()) {
                return amountWithdrawn_;
            }
            amountWithdrawn_ =
                amountWithdrawn_ +
                lenders[lowest_].withdraw(amount_ - amountWithdrawn_);
            idx_++;
            // Prevent infinite loop
            if (idx_ >= 6) {
                return amountWithdrawn_;
            }
        }
    }

    /**
     * @notice Liquidate as many assets as possible into 'want,' disregarding slippage,
     *  up to 'amountNeeded_'. Any excess should also be reinvested.
     * @param amountNeeded_ The amount of 'want' to be liquidated.
     * @return amountFreed_ The amount of 'want' that will be liquidated.
     * @return loss_ The amount of 'want' lost.
     */
    function _liquidatePosition(
        uint256 amountNeeded_
    ) internal override returns (uint256 amountFreed_, uint256 loss_) {
        uint256 balance_ = want.balanceOf(address(this));

        if (balance_ >= amountNeeded_) {
            // If we don't set a reserve here, the withdrawer will receive our full balance
            return (amountNeeded_, 0);
        } else {
            uint256 received_ = _withdrawSome(amountNeeded_ - balance_) +
                balance_;
            if (received_ >= amountNeeded_) {
                return (amountNeeded_, 0);
            } else {
                return (received_, 0);
            }
        }
    }

    /**
     * @notice Forcefully remove the lender even if it still has a balance.
     * @param lenderAddress_ The address to be removed.
     * @param force_ If false, it will revert if the lender's tokens are insufficient. If true, the lender will be removed even if funds are insufficient.
     */
    function _removeLender(address lenderAddress_, bool force_) internal {
        for (uint256 i = 0; i < lenders.length; i++) {
            if (lenderAddress_ == address(lenders[i])) {
                bool allWithdrawn_ = lenders[i].withdrawAll();

                if (!force_) {
                    require(allWithdrawn_, "Withdraw failed");
                }

                // Swap the last index with the current one
                // Remove the last index
                if (i != lenders.length - 1) {
                    lenders[i] = lenders[lenders.length - 1];
                }

                // Pop shortens the array by 1, thereby deleting the last index
                lenders.pop();

                // If there is a balance to spend, we might as well put it into the best lender
                if (want.balanceOf(address(this)) > 0) {
                    _adjustPosition(0);
                }
                return;
            }
        }
        require(false, "Not lender");
    }

    /**
     * @notice Liquidate all positions by withdrawing from the worst rate first.
     * @return amountFreed_ The total amount of 'want' that will be liquidated.
     */
    function _liquidateAllPositions()
        internal
        override
        returns (uint256 amountFreed_)
    {
        amountFreed_ = _withdrawSome(lentTotalAssets());
    }

    /**
     * @notice Perform any necessary preparations for migrating this Strategy.
     *  Settle all debts and profits from lenders.
     */
    function _prepareMigration(address) internal override {
        uint256 outstanding_ = vault.strategies(address(this)).totalDebt;
        _prepareReturn(outstanding_);
    }

    function _uniswapRouter()
        internal
        view
        virtual
        returns (IUniswapV2Router02)
    {
        return IUniswapV2Router02(UNISWAP_ROUTER);
    }

    function _weth() internal view virtual returns (address) {
        return WETH;
    }

    /**
     * @notice Estimate the impact on APR if we add more funds.
     *  This estimation does not take into account position adjustments.
     * @param change_ The amount of 'want' to increase.
     */
    function _estimateDebtLimitIncrease(
        uint256 change_
    ) internal view returns (uint256) {
        uint256 highestAPR_ = 0;
        uint256 aprChoice_ = 0;
        uint256 assets_ = 0;

        for (uint256 i = 0; i < lenders.length; i++) {
            uint256 apr_ = lenders[i].aprAfterDeposit(change_);
            if (apr_ > highestAPR_) {
                aprChoice_ = i;
                highestAPR_ = apr_;
                assets_ = lenders[i].nav();
            }
        }

        uint256 weightedAPR_ = highestAPR_ * (assets_ + change_);

        for (uint256 i = 0; i < lenders.length; i++) {
            if (i != aprChoice_) {
                weightedAPR_ = weightedAPR_ + lenders[i].weightedApr();
            }
        }

        return weightedAPR_ / (estimatedTotalAssets() + change_);
    }

    /**
     * @notice Estimate the debt limit decrease.
     *  This estimation is not accurate and should only be used for very general decision making.
     * @param change_ The amount of 'want' to decrease.
     */
    function _estimateDebtLimitDecrease(
        uint256 change_
    ) internal view returns (uint256) {
        uint256 lowestApr_ = type(uint256).max;
        uint256 aprChoice_ = 0;

        for (uint256 i = 0; i < lenders.length; i++) {
            uint256 apr_ = lenders[i].aprAfterDeposit(change_);
            if (apr_ < lowestApr_) {
                aprChoice_ = i;
                lowestApr_ = apr_;
            }
        }

        uint256 weightedAPR_ = 0;

        for (uint256 i = 0; i < lenders.length; i++) {
            if (i != aprChoice_) {
                weightedAPR_ = weightedAPR_ + lenders[i].weightedApr();
            } else {
                uint256 asset_ = lenders[i].nav();
                if (asset_ < change_) {
                    // Simplistic, not accurate
                    change_ = asset_;
                }
                weightedAPR_ = weightedAPR_ + lowestApr_ * change_;
            }
        }
        return weightedAPR_ / (estimatedTotalAssets() + change_);
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
