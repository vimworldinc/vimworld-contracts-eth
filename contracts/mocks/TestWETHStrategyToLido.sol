// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {WETHStrategyToLido} from "../staking/ETHStrategies/WETHStrategyToLido.sol";
import {ICurveFi} from "../staking/interfaces/ICurveFi.sol";
import {ISteth} from "../staking/interfaces/ISteth.sol";
import {IWETH} from "../staking/interfaces/IWETH.sol";

contract TestWETHStrategyToLido is WETHStrategyToLido {
    ICurveFi private __stableSwapSTETH;
    IWETH private _wethToken;
    ISteth private _stETHToken;

    event EventPrepareReturn(uint256 profit, uint256 loss, uint256 debtPayment);
    event EventAdjustPosition(uint256 wantBalance, uint256 poolAsset);
    event EventDivest(uint256 amount);
    event EventLiquidatePosition(uint256 amountFreed, uint256 loss);
    event EventLiquidateAllPositions(uint256 amount);
    event EventPrepareMigration(uint256 wantBalance);

    function testinitialize(address _vault) public initializer {
        __BaseStrategy_init(_vault, msg.sender, msg.sender);
        __WETHStrategystETHAccumulator_init_unchained_test();
    }

    function __WETHStrategystETHAccumulator_init_unchained_test()
        internal
        onlyInitializing
    {
        // You can set these parameters on deployment to whatever you want
        maxReportDelay = 43200;
        profitFactor = 2000;
        debtThreshold = 400 * 1e18;

        maxSingleTrade = 1_000 * 1e18;
        slippageProtectionOut = 500;
        peg = 100;
    }

    function reinitialize() public reinitializer(2) {
        __WETHStrategyToLido_init_unchained();
    }

    function toInitUnchained() public {
        __WETHStrategyToLido_init_unchained();
    }

    function toInitWithBaseStrategy(address vault_) public {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
    }

    function toInitUnchainedWithBaseStrategy(address vault_) public {
        __BaseStrategy_init_unchained(vault_, msg.sender, msg.sender);
    }

    function init_eth_contracts(
        ICurveFi stableSwapSTETH_,
        IWETH weth_,
        ISteth stETH_
    ) public {
        __stableSwapSTETH = stableSwapSTETH_;
        _wethToken = weth_;
        _stETHToken = stETH_;
        _stETH().approve(address(_stableSwapSTETH()), type(uint256).max);
    }

    function prepareReturn(uint256 debtOutstanding_) external {
        (uint256 profit_, uint256 loss_, uint256 debtPayment_) = _prepareReturn(
            debtOutstanding_
        );
        emit EventPrepareReturn(profit_, loss_, debtPayment_);
    }

    function adjustPosition(uint256 value_) external {
        _adjustPosition(value_);
        emit EventAdjustPosition(
            want.balanceOf(address(this)),
            _stETH().balanceOf(address(this))
        );
    }

    function divest(uint256 amount_) external {
        emit EventDivest(_divest(amount_));
    }

    function liquidatePosition(uint256 amountNeeded_) external {
        (uint256 amountFreed_, uint256 loss_) = _liquidatePosition(
            amountNeeded_
        );
        emit EventLiquidatePosition(amountFreed_, loss_);
    }

    function liquidateAllPositions() external {
        emit EventLiquidateAllPositions(_liquidateAllPositions());
    }

    function prepareMigration(address strategy_) external {
        _prepareMigration(strategy_);
        emit EventPrepareMigration(want.balanceOf(address(this)));
    }

    function _stableSwapSTETH() internal view override returns (ICurveFi) {
        return __stableSwapSTETH;
    }

    function _weth() internal view override returns (IWETH) {
        return _wethToken;
    }

    function _stETH() internal view override returns (ISteth) {
        return _stETHToken;
    }

    function superStableSwapSTETH() external view returns (ICurveFi) {
        return super._stableSwapSTETH();
    }

    function superWETH() external view returns (IWETH) {
        return super._weth();
    }

    function superStETH() external view returns (ISteth) {
        return super._stETH();
    }
}
