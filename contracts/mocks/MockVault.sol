// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.19;

import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IBaseStrategy} from "../staking/interfaces/IBaseStrategy.sol";

/**
 * @title Mock Token Vault.
 * @author VIMWorld
 */
contract MockVault is ERC20PermitUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string public constant API_VERSION = "0.0.1";
    uint256 public constant MAXIMUM_STRATEGIES = 20;
    uint256 public constant MAX_BPS = 10_000; // 100%, or 10k basis points
    uint256 public constant SECS_PER_YEAR = 31_556_952; // 365.2425 days

    struct StrategyParams {
        uint256 activation; // Activation block.timestamp
        uint256 debtRatio; // Maximum borrow amount (in BPS of total assets)
        uint256 minDebtPerHarvest; // Lower limit on the increase of debt since last harvest
        uint256 maxDebtPerHarvest; // Upper limit on the increase of debt since last harvest
        uint256 lastReport; // block.timestamp of the last time a report occured
        uint256 totalDebt; // Total outstanding debt that Strategy has
        uint256 totalGain; // Total returns that Strategy has realized for Vault
        uint256 totalLoss; // Total losses that Strategy has realized for Vault
    }

    uint8 private _decimals;

    IERC20Upgradeable public token;
    address public governance;
    address public management;
    address public guardian;

    /// @notice Track the total for overhead targeting purposes
    mapping(address => StrategyParams) public strategies;

    address[MAXIMUM_STRATEGIES] public withdrawalQueue;

    bool public emergencyShutdown;

    uint256 public depositLimit; // Limit for totalAssets the Vault can hold
    uint256 public debtRatio; // Debt ratio for the Vault across all strategies (in BPS, <= 10k)
    uint256 public totalIdle; // Amount of tokens that are in the vault
    uint256 public totalDebt; // Amount of tokens that all strategies have borrowed

    modifier isActiveStrategy(address strategy_) {
        _assertIsActiveStrategy(strategy_);
        _;
    }

    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    modifier isNotShutDown() {
        _isNotShutDown();
        _;
    }

    function initialize(
        address token_,
        address governance_,
        string memory nameOverride_,
        string memory symbolOverride_,
        address guardian_,
        address management_
    ) public initializer {
        if (bytes(nameOverride_).length == 0) {
            nameOverride_ = string.concat(
                IERC20MetadataUpgradeable(token_).symbol(),
                " vVault"
            );
        }
        if (bytes(symbolOverride_).length == 0) {
            symbolOverride_ = string.concat(
                "vv",
                IERC20MetadataUpgradeable(token_).symbol()
            );
        }
        __ERC20_init(nameOverride_, symbolOverride_);
        __ERC20Permit_init(nameOverride_);
        __EIP712_init(nameOverride_, API_VERSION);
        __ReentrancyGuard_init();
        __Vault_init_unchained(token_, governance_, guardian_, management_);
    }

    function __Vault_init_unchained(
        address token_,
        address governance_,
        address guardian_,
        address management_
    ) internal onlyInitializing {
        token = IERC20Upgradeable(token_);
        uint256 decimals_ = IERC20MetadataUpgradeable(token_).decimals();
        require(decimals_ < 256, "Decimals too big"); // dev: see VVE-2020-0001
        _decimals = uint8(decimals_);

        governance = governance_;
        management = management_;
        guardian = guardian_;
    }

    function deposit(
        uint256 amount_,
        address recipient_
    ) external nonReentrant isNotShutDown returns (uint256) {
        if (amount_ == type(uint256).max) {
            amount_ = Math.min(
                depositLimit - _totalAssets(),
                token.balanceOf(msg.sender)
            );
        } else {
            require(
                _totalAssets() + amount_ <= depositLimit,
                "Exceed deposit limit"
            );
        }
        require(
            recipient_ != address(this) && recipient_ != address(0),
            "Recipient error"
        );

        // Ensure we are depositing something
        require(amount_ > 0, "Amount is zero");

        // Issue new shares (needs to be done before taking deposit to be accurate)
        // Shares are issued to recipient (may be different from msg.sender)
        // See @dev note, above.
        uint256 shares_ = _issueSharesForAmount(recipient_, amount_);

        // Tokens are transferred from msg.sender (may be different from recipient)
        _erc20SafeTransferFrom(
            address(token),
            msg.sender,
            address(this),
            amount_
        );
        totalIdle += amount_;

        emit Deposit(recipient_, shares_, amount_);

        return shares_; // Just in case someone wants them
    }

    function withdraw(
        uint256 maxShares_,
        address recipient_,
        uint256 maxLoss_
    ) external nonReentrant returns (uint256) {
        uint256 shares_ = maxShares_; // May reduce this number below

        // Max Loss is <=100%, revert otherwise
        require(maxLoss_ <= MAX_BPS, "Exceed limit");

        if (shares_ == type(uint256).max) {
            shares_ = balanceOf(msg.sender);
        }

        // Limit to only the shares they own
        require(shares_ <= balanceOf(msg.sender), "Shares are not enough");

        // Ensure we are withdrawing something
        require(shares_ > 0, "Shares are zero");

        // See @dev note, above.
        uint256 value_ = _shareValue(shares_);
        uint256 vaultBalance_ = totalIdle;

        if (value_ > vaultBalance_) {
            uint256 totalLoss_ = 0;
            for (uint256 i = 0; i < MAXIMUM_STRATEGIES; i++) {
                address strategy_ = withdrawalQueue[i];
                if (strategy_ == address(0)) {
                    break; // We've exhausted the queue
                }

                if (value_ <= vaultBalance_) {
                    break; // We're done withdrawing
                }

                uint256 amountNeeded_ = value_ - vaultBalance_;

                amountNeeded_ = Math.min(
                    amountNeeded_,
                    strategies[strategy_].totalDebt
                );
                if (amountNeeded_ == 0) {
                    continue; // Nothing to withdraw from this Strategy, try the next one
                }

                // Force withdraw amount from each Strategy in the order set by governance
                uint256 preBalance_ = token.balanceOf(address(this));
                uint256 loss_ = IBaseStrategy(strategy_).withdraw(
                    amountNeeded_
                );
                uint256 withdrawn_ = token.balanceOf(address(this)) -
                    preBalance_;
                vaultBalance_ += withdrawn_;

                // NOTE: Withdrawer incurs any losses from liquidation
                if (loss_ > 0) {
                    value_ -= loss_;
                    totalLoss_ += loss_;
                    _reportLoss(strategy_, loss_);
                }

                strategies[strategy_].totalDebt -= withdrawn_;
                totalDebt -= withdrawn_;
                emit WithdrawFromStrategy(
                    strategy_,
                    strategies[strategy_].totalDebt,
                    loss_
                );
            }

            totalIdle = vaultBalance_;
            if (value_ > vaultBalance_) {
                value_ = vaultBalance_;
                shares_ = _sharesForAmount(value_ + totalLoss_);
            }

            require(
                totalLoss_ <= (maxLoss_ * (value_ + totalLoss_)) / MAX_BPS,
                "Losses exceed max"
            );
        }

        // Burn shares (full value of what is being withdrawn)
        _burn(msg.sender, shares_);

        totalIdle -= value_;
        // Withdraw remaining balance to _recipient (may be different to msg.sender) (minus fee)
        _erc20SafeTransfer(address(token), recipient_, value_);
        emit Withdraw(recipient_, shares_, value_);

        return value_;
    }

    function addStrategy(
        address strategy_,
        uint256 debtRatio_,
        uint256 minDebtPerHarvest_,
        uint256 maxDebtPerHarvest_
    ) external isNotShutDown onlyGovernance {
        // Check if queue is full
        require(
            withdrawalQueue[MAXIMUM_STRATEGIES - 1] == address(0),
            "Queue is full"
        );

        // Check strategy configuration
        require(strategy_ != address(0), "Address is zero");
        require(strategies[strategy_].activation == 0, "Strategy is active");
        require(
            address(this) == IBaseStrategy(strategy_).vault(),
            "Vault and strategy do not match"
        );
        require(
            address(token) == IBaseStrategy(strategy_).want(),
            "Want token does not match"
        );

        // Check strategy_ parameters
        require(debtRatio + debtRatio_ <= MAX_BPS, "Debt ratio error");
        require(
            minDebtPerHarvest_ <= maxDebtPerHarvest_,
            "Minimum debt per harvest error"
        );

        // Add strategy_ to approved strategies
        strategies[strategy_] = StrategyParams({
            activation: block.timestamp,
            debtRatio: debtRatio_,
            minDebtPerHarvest: minDebtPerHarvest_,
            maxDebtPerHarvest: maxDebtPerHarvest_,
            lastReport: block.timestamp,
            totalDebt: 0,
            totalGain: 0,
            totalLoss: 0
        });
        emit StrategyAdded(
            strategy_,
            debtRatio_,
            minDebtPerHarvest_,
            maxDebtPerHarvest_
        );

        // Update Vault parameters
        debtRatio += debtRatio_;

        // Add strategy_ to the end of the withdrawal queue
        withdrawalQueue[MAXIMUM_STRATEGIES - 1] = strategy_;
        _organizeWithdrawalQueue();
    }

    /**
     * @notice
     *  Change the quantity of assets `strategy` may manage.
     *  This may be called by governance or management.
     * @param strategy_ The Strategy to update.
     * @param debtRatio_ The quantity of assets `strategy` may now manage.
     */
    function updateStrategyDebtRatio(
        address strategy_,
        uint256 debtRatio_
    ) external onlyGovernance isActiveStrategy(strategy_) {
        require(
            IBaseStrategy(strategy_).emergencyExit() == false,
            "In emergency"
        ); // dev: strategy_ in emergency
        debtRatio -= strategies[strategy_].debtRatio;
        strategies[strategy_].debtRatio = debtRatio_;
        debtRatio += debtRatio_;
        require(debtRatio <= MAX_BPS, "Debt ratio error");
        emit StrategyUpdateDebtRatio(strategy_, debtRatio_);
    }

    function migrateStrategy(
        address oldVersion_,
        address newVersion_
    ) external onlyGovernance isActiveStrategy(oldVersion_) {
        require(newVersion_ != address(0), "Zero address");
        require(strategies[newVersion_].activation == 0, "Active new strategy");

        StrategyParams memory strategy_ = strategies[oldVersion_];

        _toRevokeStrategy(oldVersion_);
        // _revokeStrategy will lower the debtRatio
        debtRatio += strategy_.debtRatio;
        // Debt is migrated to new strategy_
        strategies[oldVersion_].totalDebt = 0;

        strategies[newVersion_] = StrategyParams({
            // NOTE: use last report for activation time, so E[R] calc works
            activation: strategy_.lastReport,
            debtRatio: strategy_.debtRatio,
            minDebtPerHarvest: strategy_.minDebtPerHarvest,
            maxDebtPerHarvest: strategy_.maxDebtPerHarvest,
            lastReport: strategy_.lastReport,
            totalDebt: strategy_.totalDebt,
            totalGain: 0,
            totalLoss: 0
        });

        IBaseStrategy(oldVersion_).migrate(newVersion_);
        emit StrategyMigrated(oldVersion_, newVersion_);

        for (uint256 idx_; idx_ < MAXIMUM_STRATEGIES; ++idx_) {
            if (withdrawalQueue[idx_] == oldVersion_) {
                withdrawalQueue[idx_] = newVersion_;
                return;
            }
        }
    }

    function revokeStrategy(address strategy_) external {
        _revokeStrategy(strategy_);
    }

    function report(
        uint256 gain_,
        uint256 loss_,
        uint256 debtPayment_
    ) external isActiveStrategy(msg.sender) returns (uint256) {
        // No lying about total available to withdraw!
        require(
            token.balanceOf(msg.sender) >= gain_ + debtPayment_,
            "Total available error"
        );

        // We have a loss to report, do it before the rest of the calculations
        if (loss_ > 0) {
            _reportLoss(msg.sender, loss_);
        }

        // Returns are always "realized gains"
        strategies[msg.sender].totalGain += gain_;

        // Compute the line of credit the Vault is able to offer the Strategy (if any)
        uint256 credit_ = _creditAvailable(msg.sender);

        // Outstanding debt the Strategy wants to take back from the Vault (if any)
        // NOTE: debtOutstanding <= StrategyParams.totalDebt;
        uint256 debt_ = _debtOutstanding(msg.sender);
        debtPayment_ = Math.min(debtPayment_, debt_);

        if (debtPayment_ > 0) {
            strategies[msg.sender].totalDebt -= debtPayment_;
            totalDebt -= debtPayment_;
            debt_ -= debtPayment_;
            // NOTE: `debt` is being tracked for later
        }

        if (credit_ > 0) {
            strategies[msg.sender].totalDebt += credit_;
            totalDebt += credit_;
        }

        uint256 totalAvail_ = gain_ + debtPayment_;
        if (totalAvail_ < credit_) {
            // credit surplus, give to Strategy
            totalIdle -= credit_ - totalAvail_;
            _erc20SafeTransfer(
                address(token),
                msg.sender,
                credit_ - totalAvail_
            );
        } else if (totalAvail_ > credit_) {
            // credit deficit, take from Strategy
            totalIdle += totalAvail_ - credit_;
            _erc20SafeTransferFrom(
                address(token),
                msg.sender,
                address(this),
                totalAvail_ - credit_
            );
        }
        // else, don't do anything because it is balanced

        // Update reporting time
        strategies[msg.sender].lastReport = block.timestamp;

        emit StrategyReported(
            msg.sender,
            _shareValue(10 ** decimals()),
            gain_,
            loss_,
            debtPayment_,
            strategies[msg.sender].totalGain,
            strategies[msg.sender].totalLoss,
            strategies[msg.sender].totalDebt,
            credit_,
            strategies[msg.sender].debtRatio
        );

        if (strategies[msg.sender].debtRatio == 0 || emergencyShutdown) {
            // Take every last penny the Strategy has (Emergency Exit/revokeStrategy)
            // NOTE: This is different than `debt` in order to extract *all* of the returns
            return IBaseStrategy(msg.sender).estimatedTotalAssets();
        } else {
            // Otherwise, just return what we have as debt outstanding
            return debt_;
        }
    }

    function apiVersion() external pure returns (string memory) {
        return API_VERSION;
    }

    function setDepositLimit(uint256 limit_) external onlyGovernance {
        depositLimit = limit_;
        emit UpdateDepositLimit(limit_);
    }

    function setEmergencyShutdown(bool active_) external {
        _onlyGovernance();
        emergencyShutdown = active_;
        emit EmergencyShutdown(active_);
    }

    /**
     * @notice
     *  Returns the total quantity of all assets under control of this
     *  Vault, whether they're loaned out to a Strategy, or currently held in
     *  the Vault.
     * @return The total assets under control of this Vault.
     */
    function totalAssets() external view returns (uint256) {
        return _totalAssets();
    }

    /**
     * @notice
     *  Determines if `strategy_` is past its debt limit and if any tokens
     *  should be withdrawn to the Vault.
     * @param strategy_ The Strategy to check. Defaults to the caller.
     * @return The quantity of tokens to withdraw.
     */
    function debtOutstanding(
        address strategy_
    ) external view returns (uint256) {
        return _debtOutstanding(strategy_);
    }

    /**
     * @notice
     *  Amount of tokens in Vault a Strategy has access to as a credit line.
     *
     *  This will check the Strategy's debt limit, as well as the tokens
     *  available in the Vault, and determine the maximum amount of tokens
     *  (if any) the Strategy may draw on.
     *
     *  In the rare case the Vault is in emergency shutdown this will return 0.
     * @param strategy_ The Strategy to check. Defaults to caller.
     * @return The quantity of tokens available for the Strategy to draw on.
     */
    function creditAvailable(
        address strategy_
    ) external view returns (uint256) {
        return _creditAvailable(strategy_);
    }

    /**
     * @notice
     *  Provide an accurate expected value for the return this `strategy_`
     *  would provide to the Vault the next time `report()` is called
     *  (since the last time it was called).
     * @param strategy_ The Strategy to determine the expected return for. Defaults to caller.
     * @return
     *  The anticipated amount `strategy_` should make on its investment
     *  since its last report.
     */
    function expectedReturn(address strategy_) external view returns (uint256) {
        return _expectedReturn(strategy_);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function _transfer(
        address from_,
        address to_,
        uint256 amount_
    ) internal override {
        require(to_ != address(this), "ERC20: transfer to vault");
        super._transfer(from_, to_, amount_);
    }

    function _erc20SafeTransfer(
        address token_,
        address receiver_,
        uint256 amount_
    ) internal {
        IERC20Upgradeable(token_).safeTransfer(receiver_, amount_);
    }

    function _erc20SafeTransferFrom(
        address token_,
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal {
        IERC20Upgradeable(token_).safeTransferFrom(sender_, receiver_, amount_);
    }

    function _issueSharesForAmount(
        address to_,
        uint256 amount_
    ) internal returns (uint256) {
        uint256 shares_ = 0;
        uint256 totalSupply_ = totalSupply();
        if (totalSupply_ > 0) {
            shares_ = (amount_ * totalSupply_) / _freeFunds(); // dev: no free funds
        } else {
            shares_ = amount_;
        }

        require(shares_ != 0, "Shares are zero"); // dev: division rounding resulted in zero

        _mint(to_, shares_);

        return shares_;
    }

    function _reportLoss(address strategy_, uint256 loss_) internal {
        // Loss can only be up the amount of debt issued to strategy
        uint256 totalDebt_ = strategies[strategy_].totalDebt;
        require(totalDebt_ >= loss_, "Excessive loss");

        // Also, make sure we reduce our trust with the strategy by the amount of loss
        if (debtRatio != 0) {
            uint256 ratioChange_ = Math.min(
                (loss_ * debtRatio) / totalDebt,
                strategies[strategy_].debtRatio
            );
            strategies[strategy_].debtRatio -= ratioChange_;
            debtRatio -= ratioChange_;
        }
        // Finally, adjust our strategy's parameters by the loss
        strategies[strategy_].totalLoss += loss_;
        strategies[strategy_].totalDebt = totalDebt_ - loss_;
        totalDebt -= loss_;
    }

    /**
     * @notice Reorganize `withdrawalQueue` based on premise that if there is an
     *  empty value between two actual values, then the empty value should be
     *  replaced by the later value.
     *  Relative ordering of non-zero values is maintained.
     */
    function _organizeWithdrawalQueue() internal {
        uint256 offset_ = 0;
        for (uint256 idx_; idx_ < MAXIMUM_STRATEGIES; ++idx_) {
            address strategy_ = withdrawalQueue[idx_];
            if (strategy_ == address(0)) {
                offset_ += 1; // how many values we need to shift, always `<= idx_`
            } else if (offset_ > 0) {
                withdrawalQueue[idx_ - offset_] = strategy_;
                withdrawalQueue[idx_] = address(0);
            }
        }
    }

    function _revokeStrategy(address strategy_) internal {
        require(
            msg.sender == strategy_ ||
                msg.sender == governance ||
                msg.sender == guardian,
            "!Authorized"
        );
        require(strategies[strategy_].debtRatio != 0, "Debt ratio is zero"); // dev: already zero

        _toRevokeStrategy(strategy_);
    }

    function _toRevokeStrategy(address strategy_) internal {
        debtRatio -= strategies[strategy_].debtRatio;
        strategies[strategy_].debtRatio = 0;
        emit StrategyRevoked(strategy_);
    }

    function _totalAssets() internal view returns (uint256) {
        return totalIdle + totalDebt;
    }

    function _freeFunds() internal view returns (uint256) {
        return _totalAssets();
    }

    /// @notice Determines how many asset token would receive with `shares_` of share.
    function _shareValue(uint256 shares_) internal view returns (uint256) {
        uint256 totalSupply_ = totalSupply();
        // Returns price = 1:1 if vault is empty
        if (totalSupply_ == 0) {
            return shares_;
        }

        // NOTE: if sqrt(Vault.totalAssets()) >>> 1e39, this could potentially revert
        return (shares_ * _freeFunds()) / totalSupply_;
    }

    /**
     * @notice Determines how many shares `amount` of token would receive.
     *  See dev note on `deposit`.
     */
    function _sharesForAmount(uint256 amount_) internal view returns (uint256) {
        uint256 freeFunds_ = _freeFunds();
        if (freeFunds_ > 0) {
            // NOTE: if sqrt(token.totalSupply()) > 1e37, this could potentially revert
            return (amount_ * totalSupply()) / freeFunds_;
        } else {
            return 0;
        }
    }

    /**
     * @dev See {creditAvailable}.
     */
    function _creditAvailable(
        address strategy_
    ) internal view returns (uint256) {
        // See note on `creditAvailable()`.
        if (emergencyShutdown) {
            return 0;
        }
        uint256 vaultTotalAssets_ = _totalAssets();
        uint256 vaultDebtLimit_ = (debtRatio * vaultTotalAssets_) / MAX_BPS;
        uint256 vaultTotalDebt_ = totalDebt;
        uint256 strategyDebtLimit_ = (strategies[strategy_].debtRatio *
            vaultTotalAssets_) / MAX_BPS;
        uint256 strategyTotalDebt_ = strategies[strategy_].totalDebt;
        uint256 strategyMinDebtPerHarvest_ = strategies[strategy_]
            .minDebtPerHarvest;
        uint256 strategyMaxDebtPerHarvest_ = strategies[strategy_]
            .maxDebtPerHarvest;

        // Exhausted credit line
        if (
            strategyDebtLimit_ <= strategyTotalDebt_ ||
            vaultDebtLimit_ <= vaultTotalDebt_
        ) {
            return 0;
        }

        // Start with debt limit left for the Strategy
        uint256 available_ = strategyDebtLimit_ - strategyTotalDebt_;

        // Adjust by the global debt limit left
        available_ = Math.min(available_, vaultDebtLimit_ - vaultTotalDebt_);

        // Can only borrow up to what the contract has in reserve
        // NOTE: Running near 100% is discouraged
        available_ = Math.min(available_, totalIdle);

        if (available_ < strategyMinDebtPerHarvest_) {
            return 0;
        } else {
            return Math.min(available_, strategyMaxDebtPerHarvest_);
        }
    }

    /**
     * @dev See {expectedReturn}.
     */
    function _expectedReturn(
        address strategy_
    ) internal view returns (uint256) {
        // See note on `expectedReturn()`.
        uint256 strategyLastReport_ = strategies[strategy_].lastReport;
        uint256 timeSinceLastHarvest_ = block.timestamp - strategyLastReport_;
        uint256 totalHarvestTime_ = strategyLastReport_ -
            strategies[strategy_].activation;

        if (
            timeSinceLastHarvest_ > 0 &&
            totalHarvestTime_ > 0 &&
            IBaseStrategy(strategy_).isActive()
        ) {
            return
                (strategies[strategy_].totalGain * timeSinceLastHarvest_) /
                totalHarvestTime_;
        } else {
            return 0; // Covers the scenario when block.timestamp == activation
        }
    }

    /**
     * @dev See {debtOutstanding}.
     */
    function _debtOutstanding(
        address strategy_
    ) internal view returns (uint256) {
        // See note on `debtOutstanding()`.
        if (debtRatio == 0) {
            return strategies[strategy_].totalDebt;
        }

        uint256 strategyDebtLimit_ = (strategies[strategy_].debtRatio *
            _totalAssets()) / MAX_BPS;
        uint256 strategyTotalDebt_ = strategies[strategy_].totalDebt;

        if (emergencyShutdown) {
            return strategyTotalDebt_;
        } else if (strategyTotalDebt_ <= strategyDebtLimit_) {
            return 0;
        } else {
            return strategyTotalDebt_ - strategyDebtLimit_;
        }
    }

    function _assertIsActiveStrategy(address strategy_) internal view {
        require(strategies[strategy_].activation > 0, "Inactive strategy");
    }

    function _onlyGovernance() internal view {
        require(msg.sender == governance, "!Governance");
    }

    function _isNotShutDown() internal view {
        require(emergencyShutdown == false, "Emergency shutdown");
    }

    event Deposit(address indexed recipient, uint256 shares, uint256 amount);

    event Withdraw(address indexed recipient, uint256 shares, uint256 amount);

    event StrategyAdded(
        address indexed strategy,
        uint256 debtRatio, // Maximum borrow amount (in BPS of total assets)
        uint256 minDebtPerHarvest, // Lower limit on the increase of debt since last harvest
        uint256 maxDebtPerHarvest // Upper limit on the increase of debt since last harvest
    );

    event StrategyReported(
        address indexed strategy,
        uint256 pricePerShare,
        uint256 gain,
        uint256 loss,
        uint256 debtPaid,
        uint256 totalGain,
        uint256 totalLoss,
        uint256 totalDebt,
        uint256 debtAdded,
        uint256 debtRatio
    );

    event WithdrawFromStrategy(
        address indexed strategy,
        uint256 totalDebt,
        uint256 loss
    );

    event UpdateDepositLimit(
        uint256 depositLimit // New active deposit limit
    );

    event EmergencyShutdown(
        bool active // New emergency shutdown state (if false, normal operation enabled)
    );

    event StrategyUpdateDebtRatio(
        address indexed strategy, // Address of the strategy for the debt ratio adjustment
        uint256 debtRatio // The new debt limit for the strategy (in BPS of total assets)
    );

    event StrategyMigrated(
        address indexed oldVersion, // Old version of the strategy to be migrated
        address indexed newVersion // New version of the strategy
    );

    event StrategyRevoked(
        address indexed strategy // Address of the strategy that is revoked
    );
}
