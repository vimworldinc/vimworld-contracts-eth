// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

interface ICurveFi {
    function exchange(
        int128 from,
        int128 to,
        uint256 _from_amount,
        uint256 _min_to_amount
    ) external payable;

    function balances(int128) external view returns (uint256);

    function get_dy(
        int128 from,
        int128 to,
        uint256 _from_amount
    ) external view returns (uint256);

}
