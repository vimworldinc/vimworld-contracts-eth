// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

interface IBaseStrategy {
    function name() external pure returns (string memory);

    function want() external view returns (address);

    function vault() external view returns (address);

    function keeper() external view returns (address);

    function apiVersion() external pure returns (string memory);

    function isActive() external view returns (bool);

    function delegatedAssets() external view returns (uint256);

    function estimatedTotalAssets() external view returns (uint256);

    function withdraw(uint256 amount) external returns (uint256);

    function migrate(address newStrategy) external;

    function emergencyExit() external view returns (bool);

    function tendTrigger(uint256 callCost) external view returns (bool);

    function tend() external;

    function harvestTrigger(uint256 callCost) external view returns (bool);

    function harvest() external;

    function strategist() external view returns (address);

    function management() external view returns (address);
}
