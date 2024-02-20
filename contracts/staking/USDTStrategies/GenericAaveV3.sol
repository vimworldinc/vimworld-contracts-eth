// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {DataTypesV3} from "../interfaces/aave/DataTypesV3.sol";
import {IPool} from "../interfaces/aave/IPool.sol";
import {IProtocolDataProvider} from "../interfaces/aave/IProtocolDataProvider.sol";
import {IAToken} from "../interfaces/aave/IAtoken.sol";
import {GenericLenderBase} from "../base/GenericLenderBase.sol";
import {IReserveInterestRateStrategy} from "../interfaces/aave/IReserveInterestRateStrategy.sol";

/**
 * @title A lender for AaveV3.
 * @author VIMWorld
 * @notice
 *  A lender plugin for LenderYieldOptimizer for any erc20 asset on AaveV3,
 *  and without incentive reward.
 */
contract GenericAaveV3 is GenericLenderBase {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using Address for address;

    uint16 internal constant _DEFAULT_REFERRAL = 0;
    IProtocolDataProvider public constant PROTOCOL_DATA_PROVIDER =
        IProtocolDataProvider(0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3);

    IAToken public aToken;

    uint16 internal _customReferral;

    error ErrorGenericAaveAlreadyInitialized();
    error ErrorInvalidReferralCode();

    /**
     * @notice Initializes the contract, this is called only once, when the
     *  contract is deployed.
     * @param strategy_ The strategy that will connect the lender to.
     * @param name_ The name of the Strategy.
     */
    function initialize(
        address strategy_,
        string memory name_
    ) public initializer {
        __GenericLenderBase_init(strategy_, name_);
        __GenericAaveV3_init_unchained();
    }

    function __GenericAaveV3_init_unchained() internal onlyInitializing {
        if (address(aToken) != address(0)) {
            revert ErrorGenericAaveAlreadyInitialized();
        }

        aToken = IAToken(
            _lendingPool().getReserveData(address(want)).aTokenAddress
        );

        uint256 allowance_ = IERC20Upgradeable(address(want)).allowance(
            address(this),
            address(_lendingPool())
        );
        IERC20Upgradeable(address(want)).safeIncreaseAllowance(
            address(_lendingPool()),
            type(uint256).max - allowance_
        );
    }

    function setReferralCode(uint16 customReferral_) external management {
        if (customReferral_ == 0) {
            revert ErrorInvalidReferralCode();
        }
        _customReferral = customReferral_;
    }

    /**
     * @notice Deposit contract's balance of 'want' to Aave.
     */
    function deposit() external management {
        uint256 balance = want.balanceOf(address(this));
        _deposit(balance);
    }

    /**
     * @notice Withdraw an amount including any want balance.
     * @param amount_ How much 'want' to withdraw.
     */
    function withdraw(uint256 amount_) external management returns (uint256) {
        return _withdraw(amount_);
    }

    /// @notice Sends balance plus amount to governance.
    function emergencyWithdraw(uint256 amount_) external onlyGovernance {
        _lendingPool().withdraw(address(want), amount_, address(this));

        want.safeTransfer(vault.governance(), want.balanceOf(address(this)));
    }

    function withdrawAll() external management returns (bool) {
        uint256 invested_ = _nav();
        uint256 returned_ = _withdraw(invested_);
        return returned_ >= invested_;
    }

    function nav() external view returns (uint256) {
        return _nav();
    }

    function apr() external view returns (uint256) {
        return _apr();
    }

    function weightedApr() external view returns (uint256) {
        return _apr() * _nav();
    }

    /**
     * @notice Calculate the new apr after deposit `extraAmount_` 'want' token.
     * @param extraAmount_ How much 'want' to deposit.
     */
    function aprAfterDeposit(
        uint256 extraAmount_
    ) external view returns (uint256) {
        // Need to calculate new supplyRate after Deposit (when deposit has not been done yet).
        DataTypesV3.ReserveData memory reserveData_ = _lendingPool()
            .getReserveData(address(want));

        (
            uint256 unbacked_,
            ,
            ,
            uint256 totalStableDebt_,
            uint256 totalVariableDebt_,
            ,
            ,
            ,
            uint256 averageStableBorrowRate_,
            ,
            ,

        ) = _protocolDataProvider().getReserveData(address(want));

        (, , , , uint256 reserveFactor_, , , , , ) = _protocolDataProvider()
            .getReserveConfigurationData(address(want));

        DataTypesV3.CalculateInterestRatesParams memory params_ = DataTypesV3
            .CalculateInterestRatesParams(
                unbacked_,
                extraAmount_,
                0,
                totalStableDebt_,
                totalVariableDebt_,
                averageStableBorrowRate_,
                reserveFactor_,
                address(want),
                address(aToken)
            );

        (uint256 newLiquidityRate_, , ) = IReserveInterestRateStrategy(
            reserveData_.interestRateStrategyAddress
        ).calculateInterestRates(params_);

        return newLiquidityRate_ / 1e9; // Divided by 1e9 to go from Ray to Wad
    }

    function hasAssets() external view returns (bool) {
        return
            aToken.balanceOf(address(this)) > dust ||
            want.balanceOf(address(this)) > dust;
    }

    function underlyingBalanceStored() public view returns (uint256 balance_) {
        balance_ = aToken.balanceOf(address(this));
    }

    /**
     * @dev See {withdraw}.
     */
    function _withdraw(uint256 amount_) internal returns (uint256) {
        uint256 balanceUnderlying_ = underlyingBalanceStored();
        uint256 looseBalance_ = want.balanceOf(address(this));
        uint256 total_ = balanceUnderlying_ + looseBalance_;

        if (amount_ > total_) {
            // Cant withdraw more than we own.
            amount_ = total_;
        }

        if (looseBalance_ >= amount_) {
            want.safeTransfer(address(strategy), amount_);
            return amount_;
        }

        // Not state changing but OK because of previous call.
        uint256 liquidity_ = want.balanceOf(address(aToken));

        if (liquidity_ > dust) {
            uint256 toWithdraw = amount_ - looseBalance_;

            if (toWithdraw <= liquidity_) {
                // We can take all
                _lendingPool().withdraw(
                    address(want),
                    toWithdraw,
                    address(this)
                );
            } else {
                // Take all we can
                _lendingPool().withdraw(
                    address(want),
                    liquidity_,
                    address(this)
                );
            }
        }
        looseBalance_ = want.balanceOf(address(this));
        want.safeTransfer(address(strategy), looseBalance_);
        return looseBalance_;
    }

    /**
     * @dev See {deposit}.
     */
    function _deposit(uint256 amount_) internal {
        IPool lp_ = _lendingPool();
        // NOTE: check if allowance is enough and acts accordingly
        // allowance might not be enough if
        //     i) initial allowance has been used (should take years)
        //     ii) lendingPool contract address has changed (Aave updated the contract address)
        if (want.allowance(address(this), address(lp_)) < amount_) {
            uint256 allowance_ = IERC20Upgradeable(address(want)).allowance(
                address(this),
                address(lp_)
            );
            IERC20Upgradeable(address(want)).safeIncreaseAllowance(
                address(lp_),
                type(uint256).max - allowance_
            );
        }

        uint16 referral_;
        uint16 customReferral_ = _customReferral;
        if (customReferral_ != 0) {
            referral_ = customReferral_;
        } else {
            referral_ = _DEFAULT_REFERRAL;
        }

        lp_.supply(address(want), amount_, address(this), referral_);
    }

    function _nav() internal view returns (uint256) {
        return want.balanceOf(address(this)) + underlyingBalanceStored();
    }

    function _apr() internal view returns (uint256) {
        // Dividing by 1e9 to pass from ray to wad.
        return
            uint256(
                _lendingPool()
                    .getReserveData(address(want))
                    .currentLiquidityRate
            ) / 1e9;
    }

    function _lendingPool() internal view returns (IPool lendingPool_) {
        lendingPool_ = IPool(
            _protocolDataProvider().ADDRESSES_PROVIDER().getPool()
        );
    }

    function _protectedTokens()
        internal
        view
        override
        returns (address[] memory)
    {
        address[] memory protected_ = new address[](2);
        protected_[0] = address(want);
        protected_[1] = address(aToken);
        return protected_;
    }

    function _protocolDataProvider()
        internal
        view
        virtual
        returns (IProtocolDataProvider)
    {
        return PROTOCOL_DATA_PROVIDER;
    }
}
