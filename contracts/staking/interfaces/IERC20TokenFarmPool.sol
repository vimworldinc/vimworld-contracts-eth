// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

interface IERC20TokenFarmPool {
    function deposit(uint256 amount_) external;

    function withdraw(uint256 amount_) external;

    function withdrawReward() external returns (uint256);

    function withdrawFromAll(uint256 amount_) external;

    function earned() external view returns (uint256);

    function earned(address account_) external view returns (uint256);

    function totalAsset(address account_) external view returns (uint256);

    function updateRewardAPR(uint256 newRate_) external;

    function balanceOf(address account_) external view returns (uint256);

    function rewardRate() external view returns (uint256);

    function estimateRewards(
        uint256 principal_,
        uint256 delay_
    ) external view returns (uint256);
}
