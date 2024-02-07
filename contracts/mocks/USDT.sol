// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface USDT {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external;

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);

    function approve(address spender, uint256 amount) external;

    function transferFrom(address from, address to, uint256 amount) external;
}
