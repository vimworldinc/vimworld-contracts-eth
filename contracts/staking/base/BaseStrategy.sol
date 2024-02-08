// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {IERC20Upgradeable, SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IHealthCheck} from "../interfaces/IHealthCheck.sol";
import {IVault} from "../../interfaces/IVault.sol";

/**
 * @title Base Strategy.
 * @author VIMWorld
 * @notice
 *  BaseStrategy implements all of the required functionality to interoperate
 *  closely with the Vault contract. This contract should be inherited, and the
 *  abstract methods should be implemented to adapt the Strategy to the particular needs
 *  it has to create a return.
 *
 *  Of special interest is the relationship between `harvest()` and
 *  `vault.report()`. `harvest()` may be called simply because enough time has
 *  elapsed since the last report, and not because any funds need to be moved
 *  or positions adjusted. This is critical so that the Vault may maintain an
 *  accurate picture of the Strategy's performance. See `vault.report()`,
 *  `harvest()`, and `harvestTrigger()` for further details.
 */
abstract contract BaseStrategy is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    string public metadataURI;

    // Health checks
    bool public doHealthCheck;
    address public healthCheck;

    IVault public vault;
    address public strategist;
    address public keeper;

    IERC20Upgradeable public want;

    /// @notice The minimum number of seconds between harvest calls.
    ///  See `setMinReportDelay()` for more details.
    uint256 public minReportDelay;

    /// @notice The maximum number of seconds between harvest calls.
    ///  See `setMaxReportDelay()` for more details.
    uint256 public maxReportDelay;

    /// @notice The minimum multiple that `callCost` must be above the credit/profit to
    ///  be "justifiable". See `setProfitFactor()` for more details.
    uint256 public profitFactor;

    /// @notice Use this to adjust the threshold at which running a debt causes a
    ///  harvest trigger. See `setDebtThreshold()` for more details.
    uint256 public debtThreshold;

    /// @notice See note on `setEmergencyExit()`.
    bool public emergencyExit;

    modifier onlyAuthorized() {
        _onlyAuthorized();
        _;
    }

    modifier onlyEmergencyAuthorized() {
        _onlyEmergencyAuthorized();
        _;
    }

    modifier onlyStrategist() {
        _onlyStrategist();
        _;
    }

    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    modifier onlyKeepers() {
        _onlyKeepers();
        _;
    }

    modifier onlyVaultManagers() {
        _onlyVaultManagers();
        _;
    }

    /// @notice So indexers can keep track of this.
    event Harvested(
        uint256 profit,
        uint256 loss,
        uint256 debtPayment,
        uint256 debtOutstanding
    );

    event UpdatedStrategist(address newStrategist);
    event UpdatedKeeper(address newKeeper);
    event UpdatedMinReportDelay(uint256 delay);
    event UpdatedMaxReportDelay(uint256 delay);
    event UpdatedProfitFactor(uint256 profitFactor);
    event UpdatedDebtThreshold(uint256 debtThreshold);
    event EmergencyExitEnabled();
    event UpdatedMetadataURI(string metadataURI);
    event SetHealthCheck(address healthCheck);
    event SetDoHealthCheck(bool isDo);

    /**
     * @notice
     *  Initializes the Strategy. This is called only once when the
     *  contract is deployed.
     * @dev `vault_` should implement `IVault`.
     * @param vault_ The address of the Vault responsible for this Strategy.
     * @param strategist_ The address to assign as `strategist`.
     *  The strategist is able to change the reward address.
     * @param keeper_ The address of the keeper. The keeper can harvest
     *  and tend a strategy.
     */
    function __BaseStrategy_init(
        address vault_,
        address strategist_,
        address keeper_
    ) internal onlyInitializing {
        __BaseStrategy_init_unchained(vault_, strategist_, keeper_);
    }

    function __BaseStrategy_init_unchained(
        address vault_,
        address strategist_,
        address keeper_
    ) internal onlyInitializing {
        require(address(want) == address(0), "Strategy already initialized");

        vault = IVault(vault_);
        want = IERC20Upgradeable(vault.token());
        want.safeApprove(vault_, type(uint256).max); // Give Vault unlimited access (might save gas)
        strategist = strategist_;
        keeper = keeper_;

        // Initialize variables
        minReportDelay = 0;
        maxReportDelay = 30 days;
        profitFactor = 100;
        debtThreshold = 0;
    }

    /**
     * @notice
     *  Adjust the Strategy's position. The purpose of tending isn't to
     *  realize gains, but to maximize yield by reinvesting any returns.
     *
     *  See comments on `_adjustPosition()`.
     *
     *  This may only be called by governance, the strategist, or the keeper.
     */
    function tend() external onlyKeepers {
        // Don't take profits with this call, but adjust for better gains
        _adjustPosition(vault.debtOutstanding(address(this)));
    }

    /**
     * @notice
     *  Harvests the Strategy, recognizing any profits or losses and adjusting
     *  the Strategy's position.
     *
     *  In the rare case the Strategy is in emergency shutdown, this will exit
     *  the Strategy's position.
     *
     *  This may only be called by governance, the strategist, or the keeper.
     * @dev
     *  When `harvest()` is called, the Strategy reports to the Vault (via
     *  `vault.report()`), so in some cases `harvest()` must be called in order
     *  to take in profits, to borrow newly available funds from the Vault, or
     *  otherwise adjust its position. In other cases `harvest()` must be
     *  called to report to the Vault on the Strategy's position, especially if
     *  any losses have occurred.
     */
    function harvest() external onlyKeepers {
        uint256 profit_ = 0;
        uint256 loss_ = 0;
        uint256 debtOutstanding_ = vault.debtOutstanding(address(this));
        uint256 debtPayment_ = 0;
        if (emergencyExit) {
            // Free up as much capital as possible.
            uint256 amountFreed_ = _liquidateAllPositions();
            if (amountFreed_ < debtOutstanding_) {
                loss_ = debtOutstanding_ - amountFreed_;
            } else if (amountFreed_ > debtOutstanding_) {
                profit_ = amountFreed_ - debtOutstanding_;
            }
            debtPayment_ = debtOutstanding_ - loss_;
        } else {
            // Free up returns for Vault to pull.
            (profit_, loss_, debtPayment_) = _prepareReturn(debtOutstanding_);
        }

        // Allow Vault to take up to the "harvested" balance of this contract,
        // which is the amount it has earned since the last time it reported to
        // the Vault.
        uint256 totalDebt_ = vault.strategies(address(this)).totalDebt;
        debtOutstanding_ = vault.report(profit_, loss_, debtPayment_);

        // Check if free returns are left, and re-invest them.
        _adjustPosition(debtOutstanding_);

        // Call healthCheck contract.
        if (doHealthCheck && healthCheck != address(0)) {
            require(
                IHealthCheck(healthCheck).check(
                    profit_,
                    loss_,
                    debtPayment_,
                    debtOutstanding_,
                    totalDebt_
                ),
                "!Healthcheck"
            );
        } else {
            doHealthCheck = true;
            emit SetDoHealthCheck(true);
        }

        emit Harvested(profit_, loss_, debtPayment_, debtOutstanding_);
    }

    /**
     * @notice
     *  Withdraws `amountNeeded_` to `vault`.
     *
     *  This may only be called by the Vault.
     * @param amountNeeded_ How much `want` to withdraw.
     * @return loss_ Any realized losses.
     */
    function withdraw(uint256 amountNeeded_) external returns (uint256 loss_) {
        require(msg.sender == address(vault), "!Vault");
        // Liquidate as much as possible to `want`, up to `amountNeeded_`.
        uint256 amountFreed_;
        (amountFreed_, loss_) = _liquidatePosition(amountNeeded_);
        // Send it directly back (NOTE: Using `msg.sender` saves some gas here).
        want.safeTransfer(msg.sender, amountFreed_);
        // NOTE: Reinvest anything leftover on the next `tend`/`harvest`.
    }

    /**
     * @notice
     *  Transfers all `want` from this Strategy to `newStrategy_`.
     *
     *  This may only be called by the Vault.
     * @dev
     * The new Strategy's Vault must be the same as this Strategy's Vault.
     *  The migration process should be carefully performed to make sure all
     * the assets are migrated to the new address, which should have never
     * interacted with the vault before.
     * @param newStrategy_ The Strategy to migrate to.
     */
    function migrate(address newStrategy_) external {
        require(msg.sender == address(vault), "!Vault");
        require(
            BaseStrategy(newStrategy_).vault() == vault,
            "Vault of new strategy does not match"
        );
        _prepareMigration(newStrategy_);
        want.safeTransfer(newStrategy_, want.balanceOf(address(this)));
    }

    /**
     * @notice
     *  Activates emergency exit. Once activated, the Strategy will exit its
     *  position upon the next harvest, depositing all funds into the Vault as
     *  quickly as is reasonable given on-chain conditions.
     *
     *  This may only be called by governance or the strategist.
     * @dev
     *  See `vault.setEmergencyShutdown()` and `harvest()` for further details.
     */
    function setEmergencyExit() external onlyEmergencyAuthorized {
        emergencyExit = true;
        if (vault.strategies(address(this)).debtRatio != 0) {
            vault.revokeStrategy(address(this));
        }

        emit EmergencyExitEnabled();
    }

    /**
     * @notice
     *  Removes tokens from this Strategy that are not the type of tokens
     *  managed by this Strategy. This may be used in case of accidentally
     *  sending the wrong kind of token to this Strategy.
     *
     *  Tokens will be sent to `_governance()`.
     *
     *  This will fail if an attempt is made to sweep `want`, or any tokens
     *  that are protected by this Strategy.
     *
     *  This may only be called by governance.
     * @dev
     *  Implement `_protectedTokens()` to specify any additional tokens that
     *  should be protected from sweeping in addition to `want`.
     * @param token_ The token to transfer out of this vault.
     */
    function sweep(address token_) external onlyGovernance {
        require(token_ != address(want), "!Want");
        require(token_ != address(vault), "!Shares");

        address[] memory protectedTokens_ = _protectedTokens();
        for (uint256 i; i < protectedTokens_.length; i++)
            require(token_ != protectedTokens_[i], "!Protected");

        IERC20Upgradeable(token_).safeTransfer(
            _governance(),
            IERC20Upgradeable(token_).balanceOf(address(this))
        );
    }

    function setHealthCheck(address healthCheck_) external onlyVaultManagers {
        healthCheck = healthCheck_;
        emit SetHealthCheck(healthCheck_);
    }

    function setDoHealthCheck(bool doHealthCheck_) external onlyVaultManagers {
        doHealthCheck = doHealthCheck_;
        emit SetDoHealthCheck(doHealthCheck_);
    }

    /**
     * @notice
     *  Used to change `strategist`.
     *
     *  This may only be called by governance or the existing strategist.
     * @param strategist_ The new address to assign as `strategist`.
     */
    function setStrategist(address strategist_) external onlyAuthorized {
        require(strategist_ != address(0), "Invalid zero address");
        strategist = strategist_;
        emit UpdatedStrategist(strategist_);
    }

    /**
     * @notice
     *  Used to change `keeper`.
     *
     *  `keeper` is the only address that may call `tend()` or `harvest()`,
     *  other than `_governance()` or `strategist`. However, unlike
     *  `_governance()` or `strategist`, `keeper` may *only* call `tend()`
     *  and `harvest()`, and no other authorized functions, following the
     *  principle of least privilege.
     *
     *  This may only be called by governance or the strategist.
     * @param keeper_ The new address to assign as `keeper`.
     */
    function setKeeper(address keeper_) external onlyAuthorized {
        require(keeper_ != address(0), "Invalid zero address");
        keeper = keeper_;
        emit UpdatedKeeper(keeper_);
    }

    /**
     * @notice
     *  Used to change `minReportDelay`. `minReportDelay` is the minimum number
     *  of seconds that should pass for `harvest()` to be called.
     *
     *  For external keepers, this is the minimum time between jobs to wait.
     *  (see `harvestTrigger()` for more details.)
     *
     *  This may only be called by governance or the strategist.
     * @param delay_ The minimum number of seconds to wait between harvests.
     */
    function setMinReportDelay(uint256 delay_) external onlyAuthorized {
        minReportDelay = delay_;
        emit UpdatedMinReportDelay(delay_);
    }

    /**
     * @notice
     *  Used to change `maxReportDelay`. `maxReportDelay` is the maximum number
     *  of seconds that should pass for `harvest()` to be called.
     *
     *  For external keepers, this is the maximum time between jobs to wait.
     *  (see `harvestTrigger()` for more details.)
     *
     *  This may only be called by governance or the strategist.
     * @param delay_ The maximum number of seconds to wait between harvests.
     */
    function setMaxReportDelay(uint256 delay_) external onlyAuthorized {
        maxReportDelay = delay_;
        emit UpdatedMaxReportDelay(delay_);
    }

    /**
     * @notice
     *  Used to change `profitFactor`. `profitFactor` is used to determine
     *  if it's worthwhile to harvest, given gas costs. (See `harvestTrigger()`
     *  for more details.)
     *
     *  This may only be called by governance or the strategist.
     * @param profitFactor_ A ratio to multiply anticipated
     * `harvest()` gas cost against.
     */
    function setProfitFactor(uint256 profitFactor_) external onlyAuthorized {
        profitFactor = profitFactor_;
        emit UpdatedProfitFactor(profitFactor_);
    }

    /**
     * @notice
     *  Sets how far the Strategy can go into loss without a harvest and report
     *  being required.
     *
     *  By default, this is 0, meaning any losses would cause a harvest, which
     *  will subsequently report the loss to the Vault for tracking. (See
     *  `harvestTrigger()` for more details.)
     *
     *  This may only be called by governance or the strategist.
     * @param debtThreshold_ How big of a loss this Strategy may carry without
     * being required to report to the Vault.
     */
    function setDebtThreshold(uint256 debtThreshold_) external onlyAuthorized {
        debtThreshold = debtThreshold_;
        emit UpdatedDebtThreshold(debtThreshold_);
    }

    /**
     * @notice
     *  Used to change `metadataURI`. `metadataURI` is used to store the URI
     * of the file describing the strategy.
     *
     *  This may only be called by governance or the strategist.
     * @param metadataURI_ The URI that describes the strategy.
     */
    function setMetadataURI(
        string calldata metadataURI_
    ) external onlyAuthorized {
        metadataURI = metadataURI_;
        emit UpdatedMetadataURI(metadataURI_);
    }

    /**
     * @notice This Strategy's name.
     * @dev
     *  You can use this field to manage the "version" of this Strategy, e.g.
     *  `StrategySomethingOrOtherV1`. However, "API Version" is managed by
     *  `apiVersion()` function above.
     * @return This Strategy's name.
     */
    function name() external view virtual returns (string memory);

    /**
     * @notice
     *  The amount (priced in want) of the total assets managed by this strategy should not count
     *  towards VIMWorld's TVL calculations.
     * @dev
     *  You can override this field to set it to a non-zero value if some of the assets of this
     *  Strategy are somehow delegated inside another part of VIMWorld's ecosystem, e.g., another Vault.
     *  Note that this value must be strictly less than or equal to the amount provided by
     *  `estimatedTotalAssets()` below, as the TVL calc will be total assets minus delegated assets.
     *  Also note that this value is used to determine the total assets under management by this
     *  strategy for the purposes of computing the management fee in `Vault`.
     * @return
     *  The amount of assets this strategy manages that should not be included in VIMWorld's Total Value
     *  Locked (TVL) calculation across its ecosystem.
     */
    function delegatedAssets() external view virtual returns (uint256) {
        return 0;
    }

    /**
     * @notice
     *  Used to track which version of `IBaseStrategy` this Strategy
     *  implements.
     * @dev The Strategy's version must match the Vault's `API_VERSION`.
     * @return A string that holds the current API version of this contract.
     */
    function apiVersion() public pure returns (string memory) {
        return "0.0.1";
    }

    /**
     * @notice
     *  Provide an accurate conversion from `amtInWei_` (denominated in wei)
     *  to `want` (using the native decimal characteristics of `want`).
     * @dev
     *  Care must be taken when working with decimals to assure that the conversion
     *  is compatible. As an example:
     *
     *      given 1e17 wei (0.1 ETH) as input, and want is USDC (6 decimals),
     *      with USDC/ETH = 1800, this should give back 1800000000 (180 USDC).
     *
     * @param amtInWei_ The amount (in wei/1e-18 ETH) to convert to `want`.
     * @return The amount in `want` of `_amtInEth` converted to `want`.
     **/
    function ethToWant(uint256 amtInWei_) public view virtual returns (uint256);

    /**
     * @notice
     *  Provide an accurate estimate for the total amount of assets
     *  (principle + return) that this Strategy is currently managing,
     *  denominated in terms of `want` tokens.
     *
     *  This total should be "realizable" e.g. the total value that could
     *  *actually* be obtained from this Strategy if it were to divest its
     *  entire position based on current on-chain conditions.
     * @dev
     *  Care must be taken in using this function, since it relies on external
     *  systems, which could be manipulated by the attacker to give an inflated
     *  (or reduced) value produced by this function, based on current on-chain
     *  conditions (e.g. this function is possible to influence through
     *  flashloan attacks, oracle manipulations, or other DeFi attack
     *  mechanisms).
     *
     *  It is up to governance to use this function to correctly order this
     *  Strategy relative to its peers in the withdrawal queue to minimize
     *  losses for the Vault based on sudden withdrawals. This value should be
     *  higher than the total debt of the Strategy and higher than its expected
     *  value to be "safe".
     * @return The estimated total assets in this Strategy.
     */
    function estimatedTotalAssets() public view virtual returns (uint256);

    /*
     * @notice
     *  Provide an indication of whether this strategy is currently "active"
     *  in that it is managing an active position, or will manage a position in
     *  the future. This should correlate to `harvest()` activity, so that Harvest
     *  events can be tracked externally by indexing agents.
     * @return True if the strategy is actively managing a position.
     */
    function isActive() public view returns (bool) {
        return
            vault.strategies(address(this)).debtRatio > 0 ||
            estimatedTotalAssets() > 0;
    }

    /**
     * @notice
     *  Provide a signal to the keeper that `tend()` should be called. The
     *  keeper will provide the estimated gas cost that they would pay to call
     *  `tend()`, and this function should use that estimate to make a
     *  determination if calling it is "worth it" for the keeper. This is not
     *  the only consideration into issuing this trigger, for example if the
     *  position would be negatively affected if `tend()` is not called
     *  shortly, then this can return `true` even if the keeper might be
     *  "at a loss" (keepers are always reimbursed by VIMWorld).
     * @dev
     *  `callCostInWei_` must be priced in terms of `wei` (1e-18 ETH).
     *
     *  This call and `harvestTrigger()` should never return `true` at the same
     *  time.
     * * param callCostInWei_, The keeper's estimated gas cost to call `tend()` (in wei).
     * @return `true` if `tend()` should be called, `false` otherwise.
     */
    function tendTrigger(uint256) public view virtual returns (bool) {
        // We usually don't need tend, but if there are positions that need
        // active maintenance, overriding this function is how you would
        // signal for that.
        // If your implementation uses the cost of the call in want, you can
        // use uint256 callCost = ethToWant(callCostInWei_);

        return false;
    }

    /**
     * @notice
     *  Provide a signal to the keeper that `harvest()` should be called. The
     *  keeper will provide the estimated gas cost that they would pay to call
     *  `harvest()`, and this function should use that estimate to make a
     *  determination if calling it is "worth it" for the keeper. This is not
     *  the only consideration into issuing this trigger; for example, if the
     *  position would be negatively affected if `harvest()` is not called
     *  shortly, then this can return `true` even if the keeper might be "at a
     *  loss" (keepers are always reimbursed by VIMWorld).
     * @dev
     *  `callCostInWei_` must be priced in terms of `wei` (1e-18 ETH).
     *
     *  This call and `tendTrigger` should never return `true` at the
     *  same time.
     *
     *  See `min/maxReportDelay`, `profitFactor`, `debtThreshold` to adjust the
     *  strategist-controlled parameters that will influence whether this call
     *  returns `true` or not. These parameters will be used in conjunction
     *  with the parameters reported to the Vault (see `params`) to determine
     *  if calling `harvest()` is merited.
     *
     *  It is expected that an external system will check `harvestTrigger()`.
     * @param callCostInWei_ The keeper's estimated gas cost to call `harvest()` (in wei).
     * @return `true` if `harvest()` should be called, `false` otherwise.
     */
    function harvestTrigger(
        uint256 callCostInWei_
    ) public view virtual returns (bool) {
        uint256 callCost_ = ethToWant(callCostInWei_);
        IVault.StrategyParams memory params_ = vault.strategies(address(this));

        // Should not trigger if the Strategy is not activated.
        if (params_.activation == 0) return false;

        // Should not trigger if we haven't waited long enough since the previous harvest.
        if (block.timestamp - params_.lastReport < minReportDelay) return false;

        // Should trigger if it hasn't been called in a while.
        if (block.timestamp - params_.lastReport >= maxReportDelay) return true;

        // If some amount is owed, pay it back.
        // NOTE: Since debt is based on deposits, it makes sense to guard against large
        //       changes to the value from triggering a harvest directly through user
        //       behavior. This should ensure reasonable resistance to manipulation
        //       from user-initiated withdrawals as the outstanding debt fluctuates.
        uint256 outstanding_ = vault.debtOutstanding(address(this));
        if (outstanding_ > debtThreshold) return true;

        // Check for profits and losses.
        uint256 total_ = estimatedTotalAssets();
        // Trigger if we have a loss to report.
        if (total_ + debtThreshold < params_.totalDebt) return true;

        uint256 profit_ = 0;
        if (total_ > params_.totalDebt) profit_ = total_ - params_.totalDebt; // We've earned a profit!

        // Otherwise, only trigger if it "makes sense" economically (gas cost
        // is <N% of value moved).
        uint256 credit_ = vault.creditAvailable(address(this));
        return (profitFactor * callCost_ < credit_ + profit_);
    }

    /**
     * @notice
     *  Perform any Strategy unwinding or other calls necessary to capture the
     *  "free return" this Strategy has generated since the last time its core
     *  position(s) were adjusted. Examples include unwrapping extra rewards.
     *  This call is only used during "normal operation" of a Strategy, and
     *  should be optimized to minimize losses as much as possible.
     *
     *  This method returns any realized profits and/or realized losses
     *  incurred, and should return the total amounts of profits/losses/debt
     *  payments (in `want` tokens) for the Vault's accounting (e.g.
     *  `want.balanceOf(this) >= debtPayment_ + profit_`).
     *
     *  `debtOutstanding_` will be 0 if the Strategy is not past the configured
     *  debt limit, otherwise its value will be how far past the debt limit
     *  the Strategy is. The Strategy's debt limit is configured in the Vault.
     *
     *  NOTE: `debtPayment_` should be less than or equal to `debtOutstanding_`.
     *        It is okay for it to be less than `debtOutstanding_`, as that
     *        should only be used as a guide for how much is left to pay back.
     *        Payments should be made to minimize loss from slippage, debt,
     *        withdrawal fees, etc.
     *
     *  See `vault.debtOutstanding()`.
     */
    function _prepareReturn(
        uint256 debtOutstanding_
    )
        internal
        virtual
        returns (uint256 profit_, uint256 loss_, uint256 debtPayment_);

    /**
     * @notice
     *  Perform any adjustments to the core position(s) of this Strategy given
     *  what change the Vault made in the "investable capital" available to the
     *  Strategy. Note that all "free capital" in the Strategy after the report
     *  was made is available for reinvestment. Also note that this number
     *  could be 0, and you should handle that scenario accordingly.
     *
     *  See comments regarding `debtOutstanding_` on `_prepareReturn()`.
     */
    function _adjustPosition(uint256 debtOutstanding_) internal virtual;

    /**
     * @notice
     *  Liquidate up to `amountNeeded_` of `want` of this strategy's positions,
     *  irregardless of slippage. Any excess will be re-invested with `_adjustPosition()`.
     *  This function should return the amount of `want` tokens made available by the
     *  liquidation. If there is a difference between them, `loss_` indicates whether the
     *  difference is due to a realized loss or if there is some other situation at play
     *  (e.g. locked funds) where the amount made available is less than what is needed.
     *
     * NOTE: The invariant `liquidatedAmount_ + loss_ <= amountNeeded_` should always be maintained.
     */
    function _liquidatePosition(
        uint256 amountNeeded_
    ) internal virtual returns (uint256 liquidatedAmount_, uint256 loss_);

    /**
     * @notice
     *  Liquidate everything and return the amount that got freed.
     *  This function is used during emergency exit instead of `_prepareReturn()` to
     *  liquidate all of the Strategy's positions back to the Vault.
     */
    function _liquidateAllPositions()
        internal
        virtual
        returns (uint256 amountFreed_);

    /**
     * Do anything necessary to prepare this Strategy for migration, such as
     * transferring any reserve or LP tokens, CDPs, or other tokens or stores of
     * value.
     */
    function _prepareMigration(address newStrategy_) internal virtual;

    /**
     * @notice
     *  Override this to add all tokens/tokenized positions this contract
     *  manages on a persistent basis (e.g., not just for swapping back to
     *  want ephemerally).
     *
     *  NOTE: Do *not* include `want`, already included in `sweep` below.
     *
     */
    function _protectedTokens()
        internal
        view
        virtual
        returns (address[] memory);

    /**
     * Resolve governance address from Vault contract, used to make assertions
     * on protected functions in the Strategy.
     */
    function _governance() internal view returns (address) {
        return vault.governance();
    }

    function _onlyAuthorized() internal view {
        require(
            msg.sender == strategist || msg.sender == _governance(),
            "!Authorized"
        );
    }

    function _onlyEmergencyAuthorized() internal view {
        require(
            msg.sender == strategist ||
                msg.sender == _governance() ||
                msg.sender == vault.guardian() ||
                msg.sender == vault.management(),
            "!Emergency authorized"
        );
    }

    function _onlyStrategist() internal view {
        require(msg.sender == strategist, "!Strategist");
    }

    function _onlyGovernance() internal view {
        require(msg.sender == _governance(), "!Governance");
    }

    function _onlyKeepers() internal view {
        require(
            msg.sender == keeper ||
                msg.sender == strategist ||
                msg.sender == _governance() ||
                msg.sender == vault.guardian() ||
                msg.sender == vault.management(),
            "!Keeper"
        );
    }

    function _onlyVaultManagers() internal view {
        require(
            msg.sender == vault.management() || msg.sender == _governance(),
            "!Vault manager"
        );
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[38] private __gap;
}
