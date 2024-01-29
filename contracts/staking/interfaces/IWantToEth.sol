// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

interface IWantToEth {
    function wantToEth(uint256 input) external view returns (uint256);

    function ethToWant(uint256 input) external view returns (uint256);
}
