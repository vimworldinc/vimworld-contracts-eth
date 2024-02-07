// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IVault} from "../interfaces/IVault.sol";
import {BaseStrategy} from "../staking/base/BaseStrategy.sol";

/*
 * This Strategy serves as both a mock Strategy for testing, and an example
 * for integrators on how to use BaseStrategy
 */

contract TestStrategy is BaseStrategy {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bool public doReentrancy;
    bool public delegateEverything;
    IVault public realVault;

    // Some token that needs to be protected for some reason
    // Initialize this to some fake address, because we're just using it
    // to test `BaseStrategy._protectedTokens()`
    address public constant PROTECTED_TOKEN = address(0xbad);
    uint256 public operateNonce;

    function initialize(address vault_) public initializer {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
        realVault = IVault(vault_);
    }

    function reinitialize(address vault_) public reinitializer(2) {
        __BaseStrategy_init_unchained(vault_, msg.sender, msg.sender);
    }

    function name() external pure override returns (string memory) {
        return string(abi.encodePacked("TestStrategy ", apiVersion()));
    }

    // NOTE: This is a test-only function to simulate delegation
    function toggleDelegation() public {
        delegateEverything = !delegateEverything;
    }

    function delegatedAssets() external view override returns (uint256) {
        if (delegateEverything) {
            return vault.strategies(address(this)).totalDebt;
        } else {
            return 0;
        }
    }

    // NOTE: This is a test-only function to simulate losses
    function takeFunds(uint256 amount) public {
        want.safeTransfer(msg.sender, amount);
    }

    // NOTE: This is a test-only function to simulate losses
    function transferFunds(address account, uint256 amount) public {
        want.safeTransfer(account, amount);
    }

    // NOTE: This is a test-only function to enable reentrancy on withdraw
    function toggleReentrancyExploit() public {
        doReentrancy = !doReentrancy;
    }

    // NOTE: This is a test-only function to simulate a wrong want token
    function setWant(IERC20Upgradeable _want) public {
        want = _want;
    }

    // NOTE: This is a test-only function to simulate a another vault
    function setVault(IVault vault_) public {
        vault = vault_;
    }

    function ethToWant(
        uint256 amtInWei
    ) public pure override returns (uint256) {
        return amtInWei; // 1:1 conversion for testing
    }

    function estimatedTotalAssets() public view override returns (uint256) {
        // For mock, this is just everything we have
        return want.balanceOf(address(this));
    }

    function estimatedProfit() public view returns (uint256) {
        uint256 totalAssets = estimatedTotalAssets();
        uint256 totalDebt = vault.strategies(address(this)).totalDebt;
        return totalAssets > totalDebt ? totalAssets - totalDebt : 0;
    }

    function testOnlyStrategy() public onlyStrategist {}

    function _prepareReturn(
        uint256 debtOutstanding_
    )
        internal
        override
        returns (uint256 profit_, uint256 loss_, uint256 debtPayment_)
    {
        profit_ = 0;
        loss_ = 0;
        // During testing, send this contract some tokens to simulate "Rewards"
        uint256 totalAssets = want.balanceOf(address(this));
        uint256 totalDebt = vault.strategies(address(this)).totalDebt;
        if (totalAssets > debtOutstanding_) {
            debtPayment_ = debtOutstanding_;
            totalAssets = totalAssets - debtOutstanding_;
        } else {
            debtPayment_ = totalAssets;
            totalAssets = 0;
        }
        totalDebt = totalDebt - debtPayment_;

        if (totalAssets > totalDebt) {
            profit_ = totalAssets - totalDebt;
        } else {
            loss_ = totalDebt - totalAssets;
        }
        operateNonce += 1;
    }

    function _adjustPosition(uint256) internal override {
        // Whatever we have "free", consider it "invested" now
    }

    function _liquidatePosition(
        uint256 amountNeeded_
    ) internal override returns (uint256 _liquidatedAmount, uint256 loss_) {
        if (doReentrancy) {
            // simulate a malicious protocol or reentrancy situation triggered by strategy withdraw interactions
            uint256 stratBalance = IVault(address(realVault)).balanceOf(
                address(this)
            );
            IVault(address(realVault)).withdraw(stratBalance, address(this), 1);
        }

        uint256 totalDebt = realVault.strategies(address(this)).totalDebt;
        uint256 totalAssets = want.balanceOf(address(this));
        loss_ = 0;
        if (amountNeeded_ > totalAssets) {
            _liquidatedAmount = totalAssets;
            loss_ = amountNeeded_ - totalAssets;
        } else {
            // NOTE: Just in case something was stolen from this contract
            if (totalDebt > totalAssets) {
                loss_ = totalDebt - totalAssets;
                if (loss_ > amountNeeded_) loss_ = amountNeeded_;
            }
            _liquidatedAmount = amountNeeded_;
        }
    }

    function _prepareMigration(address newStrategy_) internal override {
        // Nothing needed here because no additional tokens/tokenized positions for mock
    }

    function _protectedTokens()
        internal
        pure
        override
        returns (address[] memory)
    {
        address[] memory protected = new address[](1);
        protected[0] = PROTECTED_TOKEN;
        return protected;
    }

    function _liquidateAllPositions()
        internal
        override
        returns (uint256 amountFreed_)
    {
        uint256 totalAssets = want.balanceOf(address(this));
        amountFreed_ = totalAssets;
        operateNonce += 1;
    }

    function toReport(
        IVault vault,
        uint256 gain_,
        uint256 loss_,
        uint256 debtPayment_
    ) external {
        vault.report(gain_, loss_, debtPayment_);
    }
}
