// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

interface IGenericLender {
    function lenderName() external view returns (string memory);

    function nav() external view returns (uint256);

    function strategy() external view returns (address);

    function apr() external view returns (uint256);

    function weightedApr() external view returns (uint256);

    function withdraw(uint256 amount_) external returns (uint256);

    function emergencyWithdraw(uint256 amount_) external;

    function deposit() external;

    function withdrawAll() external returns (bool);

    function hasAssets() external view returns (bool);

    function aprAfterDeposit(uint256 amount_) external view returns (uint256);

    function setDust(uint256 dust_) external;

    function sweep(address token_) external;
}
