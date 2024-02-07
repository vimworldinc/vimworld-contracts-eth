// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IProtocolDataProvider, GenericAaveV3} from "../staking/USDTStrategies/GenericAaveV3.sol";

contract TestGenericAaveV3 is GenericAaveV3 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IProtocolDataProvider public testProtocolDataProvider;

    function testinitialize(
        address strategy_,
        address protocolDataProvider_,
        string memory name_
    ) public initializer {
        require(protocolDataProvider_ != address(0), "Invalid zero address");
        testProtocolDataProvider = IProtocolDataProvider(protocolDataProvider_);

        __GenericLenderBase_init(strategy_, name_);
        __GenericAaveV3_init_unchained();
    }

    function reinitialize(
        address strategy_,
        address protocolDataProvider_,
        string memory name_
    ) public reinitializer(2) {
        require(protocolDataProvider_ != address(0), "Invalid zero address");
        testProtocolDataProvider = IProtocolDataProvider(protocolDataProvider_);

        __GenericLenderBase_init(strategy_, name_);
        __GenericAaveV3_init_unchained();
    }

    function toInitUnchained() public {
        __GenericAaveV3_init_unchained();
    }

    function toInitWithGenericLenderBase(
        address strategy_,
        string memory name_
    ) public {
        __GenericLenderBase_init(strategy_, name_);
    }

    function toInitUnchainedWithGenericLenderBase(
        address strategy_,
        string memory name_
    ) public {
        __GenericLenderBase_init_unchained(strategy_, name_);
    }

    function clearStrategy() external onlyGovernance {
        want.safeApprove(strategy, 0);
        strategy = address(0);
    }

    function updateConstant(
        address protocolDataProvider_
    ) external onlyGovernance {
        require(protocolDataProvider_ != address(0), "Invalid zero address");
        testProtocolDataProvider = IProtocolDataProvider(protocolDataProvider_);
    }

    function updateStrategy(address strategy_) external {
        want.safeApprove(strategy, 0);
        strategy = strategy_;
        want.safeApprove(strategy_, type(uint256).max);
    }

    function lendingPool() external view returns (address) {
        return address(_lendingPool());
    }

    function setLpApprove(uint256 amount_) external {
        address lp_ = address(_lendingPool());
        IERC20Upgradeable(address(want)).safeApprove(lp_, 0);
        IERC20Upgradeable(address(want)).safeApprove(lp_, amount_);
    }

    function takeFund(uint256 amount_) external {
        aToken.transfer(msg.sender, amount_);
    }

    function _protocolDataProvider()
        internal
        view
        override
        returns (IProtocolDataProvider)
    {
        return testProtocolDataProvider;
    }

    function superProtocolDataProvider()
        external
        view
        returns (IProtocolDataProvider)
    {
        return super._protocolDataProvider();
    }
}
