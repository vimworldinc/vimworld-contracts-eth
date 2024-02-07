// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {OJEEStrategyToFarm} from "../staking/OJEEStrategies/OJEEStrategyToFarm.sol";

contract TestOJEEStrategyToFarm is OJEEStrategyToFarm {
    event EventPrepareReturn(uint256 profit, uint256 loss, uint256 debtPayment);
    event EventAdjustPosition(uint256 wantBalance, uint256 poolAsset);
    event EventWithdrawSome(uint256 amount);
    event EventWithdrawAll(uint256 amount);
    event EventLiquidatePosition(uint256 amountFreed, uint256 loss);
    event EventLiquidateAllPositions(uint256 amount);
    event EventPrepareMigration(uint256 wantBalance);

    function reinitialize(
        address tokenFarmPoolAddress_
    ) public reinitializer(2) {
        __OJEEStrategyToFarm_init_unchained(tokenFarmPoolAddress_);
    }

    function toInitUnchained(address tokenFarmPoolAddress_) public {
        __OJEEStrategyToFarm_init_unchained(tokenFarmPoolAddress_);
    }

    function toInitWithBaseStrategy(address vault_) public {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
    }

    function toInitUnchainedWithBaseStrategy(address vault_) public {
        __BaseStrategy_init_unchained(vault_, msg.sender, msg.sender);
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
            tokenFarmPool.totalAsset(address(this))
        );
    }

    function withdrawSome(uint256 amount_) external {
        emit EventWithdrawSome(_withdrawSome(amount_));
    }

    function withdrawAll() external {
        emit EventWithdrawAll(_withdrawAll());
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
}
