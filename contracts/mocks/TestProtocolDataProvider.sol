// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

contract TestProtocolDataProvider {
    address public pool;

    constructor(address pool_) {
        require(pool_ != address(0), "Invalid zero address");
        pool = pool_;
    }

    function setPool(address pool_) external {
        require(pool_ != address(0), "Invalid zero address");
        pool = pool_;
    }

    function ADDRESSES_PROVIDER() external view returns (address) {
        return pool;
    }

    function getReserveData(
        address
    )
        external
        pure
        returns (
            uint256 unbacked,
            uint256 accruedToTreasuryScaled,
            uint256 totalAToken,
            uint256 totalStableDebt,
            uint256 totalVariableDebt,
            uint256 liquidityRate,
            uint256 variableBorrowRate,
            uint256 stableBorrowRate,
            uint256 averageStableBorrowRate,
            uint256 liquidityIndex,
            uint256 variableBorrowIndex,
            uint40 lastUpdateTimestamp
        )
    {
        return (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    function getReserveConfigurationData(
        address
    )
        external
        pure
        returns (
            uint256 decimals,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus,
            uint256 reserveFactor,
            bool usageAsCollateralEnabled,
            bool borrowingEnabled,
            bool stableBorrowRateEnabled,
            bool isActive,
            bool isFrozen
        )
    {
        return (0, 0, 0, 0, 0, false, false, false, false, false);
    }
}
