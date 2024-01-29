// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import {DataTypesV3} from "./DataTypesV3.sol";

//-- IReserveInterestRateStrategy implemented manually to avoid compiler errors for aprAfterDeposit function --//
/**
 * @title IReserveInterestRateStrategy
 * @author Aave
 * @notice Interface for the calculation of the interest rates
 */
interface IReserveInterestRateStrategy {
    /**
     * @notice Calculates the interest rates depending on the reserve's state and configurations
     * @param params The parameters needed to calculate interest rates
     * @return liquidityRate The liquidity rate expressed in rays
     * @return stableBorrowRate The stable borrow rate expressed in rays
     * @return variableBorrowRate The variable borrow rate expressed in rays
     **/
    function calculateInterestRates(
        DataTypesV3.CalculateInterestRatesParams calldata params
    ) external view returns (uint256, uint256, uint256);
}
