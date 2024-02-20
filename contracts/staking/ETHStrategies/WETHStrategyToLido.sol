// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ICurveFi} from "../interfaces/ICurveFi.sol";
import {ISteth} from "../interfaces/ISteth.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {BaseStrategy} from "../base/BaseStrategy.sol";

/**
 * @title A strategy for WETH to Lido.
 * @author VIMWorld
 * @notice
 *  A strategy for WETH assets.
 *  Invests WETH in Lido.
 */
contract WETHStrategyToLido is BaseStrategy {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    ICurveFi private constant _STABLE_SWAP_STETH =
        ICurveFi(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
    IWETH private constant _WETH =
        IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ISteth private constant _STETH =
        ISteth(0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84);
    uint256 private constant _DENOMINATOR = 10_000;

    int128 private constant _WETHID = 0;
    int128 private constant _STETHID = 1;

    address private _referal; // stratms. for recycling and redepositing
    uint256 public maxSingleTrade;
    uint256 public slippageProtectionOut; // = 50; // out of 10000. 50 = 0.5%

    bool public reportLoss; // false
    bool public dontInvest; // false

    uint256 public peg; // 100 = 1%

    error ErrorPegExceedLimit();
    error ErrorSlippageProtectionOutExceedLimit();

    receive() external payable {}

    /**
     * @notice Initializes the Strategy, this is called only once, when the
     *  contract is deployed.
     * @dev `vault_` should implement `IVault`.
     * @param vault_ The address of the Vault responsible for this Strategy.
     */
    function initialize(address vault_) public virtual initializer {
        __BaseStrategy_init(vault_, msg.sender, msg.sender);
        __WETHStrategyToLido_init_unchained();
    }

    function __WETHStrategyToLido_init_unchained() internal onlyInitializing {
        // You can set these parameters on deployment to whatever you want
        maxReportDelay = 43200;
        profitFactor = 2000;
        debtThreshold = 400 * 1e18;
        _referal = address(0);

        uint256 allowance_ = _stETH().allowance(
            address(this),
            address(_stableSwapSTETH())
        );
        IERC20Upgradeable(address(_stETH())).safeIncreaseAllowance(
            address(_stableSwapSTETH()),
            type(uint256).max - allowance_
        );

        maxSingleTrade = 10_000 * 1e18;
        slippageProtectionOut = 150;
        peg = 100;
    }

    // ------------------------ Authorized functions ------------------------

    function updateReferal(address referal_) external onlyEmergencyAuthorized {
        _referal = referal_;
    }

    function updateMaxSingleTrade(
        uint256 maxSingleTrade_
    ) external onlyVaultManagers {
        maxSingleTrade = maxSingleTrade_;
    }

    function updatePeg(uint256 peg_) external onlyVaultManagers {
        // Limit peg to a maximum of 10%
        if (peg_ > 1_000) {
            revert ErrorPegExceedLimit();
        }
        peg = peg_;
    }

    function updateReportLoss(bool reportLoss_) external onlyVaultManagers {
        reportLoss = reportLoss_;
    }

    function updateDontInvest(bool dontInvest_) external onlyVaultManagers {
        dontInvest = dontInvest_;
    }

    function updateSlippageProtectionOut(
        uint256 slippageProtectionOut_
    ) external onlyVaultManagers {
        if (slippageProtectionOut_ > 10_000) {
            revert ErrorSlippageProtectionOutExceedLimit();
        }
        slippageProtectionOut = slippageProtectionOut_;
    }

    /**
     * @notice Invests the token in Lido.
     * @param amount_ The amount to be invested.
     */
    function invest(uint256 amount_) external onlyEmergencyAuthorized {
        _invest(amount_);
    }

    /// @notice Should never have stuck ETH but just in case
    function rescueStuckEth() external onlyEmergencyAuthorized {
        _weth().deposit{value: address(this).balance}();
    }

    // ------------------------ Get functions ------------------------
    function name() external pure override returns (string memory) {
        return "StrategyStETHAccumulator";
    }

    /**
     * @notice Estimates the total assets.
     *  We hard code a peg here. This is so that we can build up a reserve of profit to cover peg volatility if we are forced to delever.
     *  This may sound scary but it is the equivalent of using virtual price in a curve LP. As we have seen from many exploits, virtual pricing is safer than touch pricing.
     */
    function estimatedTotalAssets() public view override returns (uint256) {
        return
            (stethBalance() * (_DENOMINATOR - peg)) /
            _DENOMINATOR +
            wantBalance();
    }

    function estimatedPotentialTotalAssets() public view returns (uint256) {
        return stethBalance() + wantBalance();
    }

    function wantBalance() public view returns (uint256) {
        return want.balanceOf(address(this));
    }

    function stethBalance() public view returns (uint256) {
        return _stETH().balanceOf(address(this));
    }

    function ethToWant(
        uint256 amtInWei_
    ) public pure override returns (uint256) {
        return amtInWei_;
    }

    /**
     * @dev See {BaseStrategy-_prepareReturn}.
     */
    function _prepareReturn(
        uint256 debtOutstanding_
    )
        internal
        virtual
        override
        returns (uint256 profit_, uint256 loss_, uint256 debtPayment_)
    {
        uint256 wantBal_ = wantBalance();
        uint256 totalAssets_ = estimatedTotalAssets();

        uint256 debt = vault.strategies(address(this)).totalDebt;
        profit_ = 0;
        loss_ = 0;
        debtPayment_ = 0;
        if (totalAssets_ >= debt) {
            profit_ = totalAssets_ - debt;

            uint256 toWithdraw_ = profit_ + debtOutstanding_;

            if (toWithdraw_ > wantBal_) {
                uint256 willWithdraw_ = Math.min(maxSingleTrade, toWithdraw_);
                uint256 withdrawn_ = _divest(willWithdraw_); // We step our withdrawals. Adjust max single trade to withdraw more.
                if (withdrawn_ < willWithdraw_) {
                    loss_ = willWithdraw_ - withdrawn_;
                }
            }
            wantBal_ = wantBalance();

            // Net off profit and loss
            if (profit_ >= loss_) {
                profit_ = profit_ - loss_;
                loss_ = 0;
            } else {
                loss_ = loss_ - profit_;
                profit_ = 0;
            }

            // Profit + debtOutstanding_ must be <= want balance. Prioritize profit first.
            if (wantBal_ < profit_) {
                profit_ = wantBal_;
            } else if (wantBal_ < toWithdraw_) {
                debtPayment_ = wantBal_ - profit_;
            } else {
                debtPayment_ = debtOutstanding_;
            }
        } else {
            if (reportLoss) {
                loss_ = debt - totalAssets_;
            }
        }
    }

    /**
     * @dev See {BaseStrategy-_liquidateAllPositions}.
     */
    function _liquidateAllPositions()
        internal
        override
        returns (uint256 amountFreed_)
    {
        _divest(stethBalance());
        amountFreed_ = wantBalance();
    }

    /**
     * @dev See {BaseStrategy-_adjustPosition}.
     */
    function _adjustPosition(uint256) internal virtual override {
        if (dontInvest) {
            return;
        }
        _invest(wantBalance());
    }

    /**
     * @dev See {invest}.
     */
    function _invest(uint256 amount_) internal returns (uint256) {
        if (amount_ == 0) {
            return 0;
        }

        amount_ = Math.min(maxSingleTrade, amount_);
        uint256 before_ = stethBalance();

        _weth().withdraw(amount_);

        // Test if we should buy instead of mint
        uint256 out_ = _stableSwapSTETH().get_dy(_WETHID, _STETHID, amount_);
        if (out_ < amount_) {
            _stETH().submit{value: amount_}(_referal);
        } else {
            _stableSwapSTETH().exchange{value: amount_}(
                _WETHID,
                _STETHID,
                amount_,
                amount_
            );
        }

        return stethBalance() - before_;
    }

    /**
     * @dev See {divest}.
     */
    function _divest(uint256 amount_) internal returns (uint256) {
        uint256 before_ = wantBalance();

        uint256 slippageAllowance_ = (amount_ *
            (_DENOMINATOR - slippageProtectionOut)) / _DENOMINATOR;
        _stableSwapSTETH().exchange(
            _STETHID,
            _WETHID,
            amount_,
            slippageAllowance_
        );

        _weth().deposit{value: address(this).balance}();

        return wantBalance() - before_;
    }

    /**
     * @notice We attempt to withdraw the full amount, and let the user decide
     *  if they take the loss or not.
     */
    function _liquidatePosition(
        uint256 amountNeeded_
    ) internal override returns (uint256 liquidatedAmount_, uint256 loss_) {
        uint256 wantBal_ = wantBalance();
        loss_ = 0;
        if (wantBal_ < amountNeeded_) {
            uint256 toWithdraw_ = amountNeeded_ - wantBal_;
            uint256 withdrawn_ = _divest(toWithdraw_);
            if (withdrawn_ < toWithdraw_) {
                loss_ = toWithdraw_ - withdrawn_;
            }
        }

        liquidatedAmount_ = amountNeeded_ - loss_;
    }

    /**
     * @dev See {BaseStrategy-_prepareMigration}.
     */
    function _prepareMigration(address newStrategy_) internal override {
        uint256 stethBal_ = stethBalance();
        if (stethBal_ > 0) {
            _stETH().transfer(newStrategy_, stethBal_);
        }
    }

    /**
     * @dev See {BaseStrategy-_protectedTokens}.
     */
    function _protectedTokens()
        internal
        view
        override
        returns (address[] memory)
    {
        address[] memory protected_ = new address[](1);
        protected_[0] = address(_stETH());
        return protected_;
    }

    function _stableSwapSTETH() internal view virtual returns (ICurveFi) {
        return _STABLE_SWAP_STETH;
    }

    function _weth() internal view virtual returns (IWETH) {
        return _WETH;
    }

    function _stETH() internal view virtual returns (ISteth) {
        return _STETH;
    }
}
