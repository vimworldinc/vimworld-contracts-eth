// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IWantToEth} from "../staking/interfaces/IWantToEth.sol";

contract MockUSDTToEthOracle is IWantToEth {
    uint256 public toEthRate = 1e12 / 2000; // 1 usdt(10**6) * 2000 * = 1 eth(10**18)

    function wantToEth(uint256 input) external view returns (uint256) {
        return input * toEthRate;
    }

    function ethToWant(uint256 input) external view returns (uint256) {
        return input / toEthRate;
    }
}
