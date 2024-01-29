// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IVault is IERC20Upgradeable {
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

    function WAD() external view returns (uint256);

    function name() external view returns (string calldata);

    function symbol() external view returns (string calldata);

    function decimals() external view returns (uint8);

    function apiVersion() external pure returns (string memory);

    function permit(
        address owner_,
        address spender_,
        uint256 amount_,
        uint256 expiry_,
        bytes calldata signature_
    ) external returns (bool);

    function deposit(
        uint256 amount_,
        address recipient_
    ) external returns (uint256);

    function withdraw(
        uint256 maxShares_,
        address recipient_,
        uint256 maxLoss_
    ) external returns (uint256);

    function token() external view returns (address);

    function strategies(
        address strategy_
    ) external view returns (StrategyParams memory);

    function pricePerShare() external view returns (uint256);

    function pricePerShareWithWAD() external view returns (uint256);

    function totalAssets() external view returns (uint256);

    function depositLimit() external view returns (uint256);

    function maxAvailableShares() external view returns (uint256);

    /**
     * View how much the Vault would increase this Strategy's borrow limit,
     * based on its present performance (since its last report). Can be used to
     * determine expectedReturn in your Strategy.
     */
    function creditAvailable(address strategy_) external view returns (uint256);

    /**
     * View how much the Vault would like to pull back from the Strategy,
     * based on its present performance (since its last report). Can be used to
     * determine expectedReturn in your Strategy.
     */
    function debtOutstanding(address strategy_) external view returns (uint256);

    /**
     * View how much the Vault expect this Strategy to return at the current
     * block, based on its present performance (since its last report). Can be
     * used to determine expectedReturn in your Strategy.
     */
    function expectedReturn(address strategy_) external view returns (uint256);

    /**
     * This is the main contact point where the Strategy interacts with the
     * Vault. It is critical that this call is handled as intended by the
     * Strategy. Therefore, this function will be called by BaseStrategy to
     * make sure the integration is correct.
     */
    function report(
        uint256 gain_,
        uint256 loss_,
        uint256 debtPayment_
    ) external returns (uint256);

    /**
     * This function should only be used in the scenario where the Strategy is
     * being retired but no migration of the positions are possible, or in the
     * extreme scenario that the Strategy needs to be put into "Emergency Exit"
     * mode in order for it to exit as quickly as possible. The latter scenario
     * could be for any reason that is considered "critical" that the Strategy
     * exits its position as fast as possible, such as a sudden change in
     * market conditions leading to losses, or an imminent failure in an
     * external dependency.
     */
    function revokeStrategy(address strategy_) external;

    /**
     * View the governance address of the Vault to assert privileged functions
     * can only be called by governance. The Strategy serves the Vault, so it
     * is subject to governance defined by the Vault.
     */
    function governance() external view returns (address);

    /**
     * View the management address of the Vault to assert privileged functions
     * can only be called by management. The Strategy serves the Vault, so it
     * is subject to management defined by the Vault.
     */
    function management() external view returns (address);

    /**
     * View the guardian address of the Vault to assert privileged functions
     * can only be called by guardian. The Strategy serves the Vault, so it
     * is subject to guardian defined by the Vault.
     */
    function guardian() external view returns (address);
}
