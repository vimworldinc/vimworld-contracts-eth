// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

contract TestUniswap {
    mapping(address => uint256) public usdToTokens;

    constructor(address[] memory tokensList_, uint256[] memory valuesList_) {
        uint256 len_ = tokensList_.length;
        require(len_ == valuesList_.length, "Not match");
        for (uint256 i = 0; i < len_; i++) {
            usdToTokens[tokensList_[i]] = valuesList_[i];
        }
    }

    function getAmountsOut(
        uint256 amountIn_,
        address[] calldata path_
    ) external view returns (uint256[] memory amounts_) {
        require(path_.length >= 2, "SwapFactory: INVALID_PATH");
        amounts_ = new uint[](path_.length);
        amounts_[0] = amountIn_;
        for (uint256 i; i < path_.length - 1; i++) {
            amounts_[i + 1] =
                (amounts_[i] * usdToTokens[path_[i + 1]]) /
                usdToTokens[path_[i]];
        }
    }

    function setUSDToTokens(
        address[] calldata tokensList_,
        uint256[] calldata valuesList_
    ) external {
        uint256 len_ = tokensList_.length;
        require(len_ == valuesList_.length, "Not match");
        for (uint256 i = 0; i < len_; i++) {
            usdToTokens[tokensList_[i]] = valuesList_[i];
        }
    }
}
