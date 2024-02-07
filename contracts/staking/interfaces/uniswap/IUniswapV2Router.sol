// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

interface IUniswapV2Router02 {
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}
