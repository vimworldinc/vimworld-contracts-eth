// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ICustomHealthCheck, IHealthCheck} from "../staking/interfaces/IHealthCheck.sol";

/**
 * @title Mock Health check for strategy.
 * @author VIMWorld
 * @notice Common module to check a strategy's health.
 */
contract MockCommonHealthCheck is IHealthCheck {
    // Default Settings for all strategies
    uint256 public constant MAX_BPS = 10_000;

    struct Limits {
        uint256 profitLimitRatio;
        uint256 lossLimitRatio;
        bool exists;
    }

    uint256 public profitLimitRatio;
    uint256 public lossLimitRatio;
    mapping(address => Limits) public strategiesLimits;

    address public governance;
    address public management;

    mapping(address => address) public checks;

    modifier onlyGovernance() {
        require(msg.sender == governance, "!Authorized");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == governance || msg.sender == management,
            "!Authorized"
        );
        _;
    }

    constructor() {
        governance = msg.sender;
        management = msg.sender;
        profitLimitRatio = 200; // Default profit limit ratio (2%)
        lossLimitRatio = 1; // Default loss limit ratio (0.01%)
    }

    function setGovernance(address governance_) external onlyGovernance {
        require(governance_ != address(0), "Invalid address");
        governance = governance_;
    }

    function setManagement(address management_) external onlyGovernance {
        require(management_ != address(0), "Invalid address");
        management = management_;
    }

    function setProfitLimitRatio(
        uint256 profitLimitRatio_
    ) external onlyAuthorized {
        require(profitLimitRatio_ < MAX_BPS, "Param exceeds limit");
        profitLimitRatio = profitLimitRatio_;
    }

    function setLossLimitRatio(
        uint256 lossLimitRatio_
    ) external onlyAuthorized {
        require(lossLimitRatio_ < MAX_BPS, "Param exceeds limit");
        lossLimitRatio = lossLimitRatio_;
    }

    /**
     * @dev Sets custom profit and loss limit ratios for a specific strategy.
     * @param strategy_ The address of the strategy for which limits are being set.
     * @param profitLimitRatio_ The custom profit limit ratio for the strategy (in basis points).
     * @param lossLimitRatio_ The custom loss limit ratio for the strategy (in basis points).
     */
    function setStrategyLimits(
        address strategy_,
        uint256 profitLimitRatio_,
        uint256 lossLimitRatio_
    ) external onlyAuthorized {
        require(profitLimitRatio_ < MAX_BPS, "Param exceeds profit limit");
        require(lossLimitRatio_ < MAX_BPS, "Param exceeds loss limit");
        strategiesLimits[strategy_] = Limits(
            profitLimitRatio_,
            lossLimitRatio_,
            true
        );
    }

    function setCheck(
        address strategy_,
        address check_
    ) external onlyAuthorized {
        checks[strategy_] = check_;
    }

    /**
     * @notice Checks the health of a strategy by running custom or default health checks.
     * @param profit_ The strategy's profit.
     * @param loss_ The strategy's loss.
     * @param debtPayment_ The amount of debt payment made by the strategy.
     * @param debtOutstanding_ The outstanding debt balance of the strategy.
     * @param totalDebt_ The total debt associated with the strategy.
     * @return A boolean indicating whether the strategy is healthy based on the checks.
     */
    function check(
        uint256 profit_,
        uint256 loss_,
        uint256 debtPayment_,
        uint256 debtOutstanding_,
        uint256 totalDebt_
    ) external view returns (bool) {
        return
            _runChecks(
                profit_,
                loss_,
                debtPayment_,
                debtOutstanding_,
                totalDebt_
            );
    }

    /**
     * @notice Run custom health checks on a strategy, or if none are defined, run the default check.
     * @param profit_ The strategy's profit.
     * @param loss_ The strategy's loss.
     * @param debtPayment_ The debt payment.
     * @param debtOutstanding_ The outstanding debt.
     * @param totalDebt_ The total debt associated with the strategy.
     * @return A boolean indicating whether the strategy passes health checks.
     */
    function _runChecks(
        uint256 profit_,
        uint256 loss_,
        uint256 debtPayment_,
        uint256 debtOutstanding_,
        uint256 totalDebt_
    ) internal view returns (bool) {
        address customCheck_ = checks[msg.sender];

        // If no custom health check is defined, use the default check.
        if (customCheck_ == address(0)) {
            return _executeDefaultCheck(profit_, loss_, totalDebt_);
        }

        // Call the custom health check contract to determine if the strategy passes the checks.
        return
            ICustomHealthCheck(customCheck_).check(
                profit_,
                loss_,
                debtPayment_,
                debtOutstanding_,
                msg.sender
            );
    }

    /**
     * @notice Execute default health checks on a strategy.
     * @param profit_ The strategy's profit.
     * @param loss_ The strategy's loss.
     * @param totalDebt_ The total debt associated with the strategy.
     * @return A boolean indicating whether the strategy passes default health checks.
     */
    function _executeDefaultCheck(
        uint256 profit_,
        uint256 loss_,
        uint256 totalDebt_
    ) internal view returns (bool) {
        Limits memory limits_ = strategiesLimits[msg.sender];
        uint256 profitLimitRatio_;
        uint256 lossLimitRatio_;

        // Check if custom limits are set for the strategy, if not, use default values.
        if (limits_.exists) {
            profitLimitRatio_ = limits_.profitLimitRatio;
            lossLimitRatio_ = limits_.lossLimitRatio;
        } else {
            profitLimitRatio_ = profitLimitRatio;
            lossLimitRatio_ = lossLimitRatio;
        }

        // Compare the strategy's profit and loss against the specified limits.
        if (profit_ > ((totalDebt_ * profitLimitRatio_) / MAX_BPS)) {
            return false;
        }
        if (loss_ > ((totalDebt_ * lossLimitRatio_) / MAX_BPS)) {
            return false;
        }

        // The strategy passes default health checks.
        return true;
    }
}
