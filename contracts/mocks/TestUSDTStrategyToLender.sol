// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IUniswapV2Router02, USDTStrategyToLender} from "../staking/USDTStrategies/USDTStrategyToLender.sol";

contract TestUSDTStrategyToLender is USDTStrategyToLender {
    address public testUniswapRouter;
    address public testWeth;

    event EventPrepareReturn(uint256 profit, uint256 loss, uint256 debtPayment);
    event EventAdjustPosition(uint256 wantBalance, uint256 poolAsset);
    event EventWithdrawSome(uint256 amount);
    event EventLiquidatePosition(uint256 amountFreed, uint256 loss);
    event EventLiquidateAllPositions(uint256 amount);
    event EventPrepareMigration(uint256 wantBalance);

    function toInitUnchained() public {
        __USDTStrategyToLender_init_unchained();
    }

    function toInitWithBaseStrategy(address vault_) public {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
    }

    function toInitUnchainedWithBaseStrategy(address vault_) public {
        __BaseStrategy_init_unchained(vault_, msg.sender, msg.sender);
    }

    function updateConstant(
        address uniswapRouter_,
        address weth_
    ) external onlyGovernance {
        require(
            uniswapRouter_ != address(0) && weth_ != address(0),
            "Invalid zero address"
        );
        testUniswapRouter = uniswapRouter_;
        testWeth = weth_;
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
            lentTotalAssets()
        );
    }

    function withdrawSome(uint256 amount_) external {
        emit EventWithdrawSome(_withdrawSome(amount_));
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

    function _uniswapRouter()
        internal
        view
        override
        returns (IUniswapV2Router02)
    {
        return IUniswapV2Router02(testUniswapRouter);
    }

    function _weth() internal view override returns (address) {
        return testWeth;
    }

    function superUniswapRouter() external view returns (IUniswapV2Router02) {
        return super._uniswapRouter();
    }

    function superWETH() external view returns (address) {
        return super._weth();
    }
}
