// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract TestCurveFi is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    int128 public constant ETHID = 0;
    int128 public constant STETHID = 1;

    bool public isPaused;
    uint256 public extraAmount;

    address public stETH;
    uint256 public ethBaseAmount;
    uint256 public stEthBaseAmount;

    receive() external payable {}

    function initialize(address stETH_) public initializer {
        ethBaseAmount = 99950000 * 1e18;
        stEthBaseAmount = 100000000 * 1e18;
        stETH = stETH_;
    }

    function exchange(
        int128 from_,
        int128 to_,
        uint256 fromAmount_,
        uint256 minToAmount_
    ) external payable {
        uint256 toAmount_;
        if (from_ == ETHID && to_ == STETHID) {
            require(msg.value == fromAmount_, "Msg.value is not enough");
            toAmount_ = _getAmountOutFromETH(fromAmount_, fromAmount_);
            IERC20Upgradeable(stETH).safeTransfer(msg.sender, toAmount_);
        } else {
            toAmount_ = _getAmountOutFromStETH(fromAmount_);
            IERC20Upgradeable(stETH).safeTransferFrom(
                msg.sender,
                address(this),
                fromAmount_
            );
            (bool success_, ) = payable(msg.sender).call{value: toAmount_}("");
            require(success_, "Fail to transfer native token");
        }
        require(toAmount_ >= minToAmount_, "Amount is too small");
    }

    function getStETHBalance() public view returns (uint256) {
        return
            IERC20Upgradeable(stETH).balanceOf(address(this)) + stEthBaseAmount;
    }

    function getETHBalance() public view returns (uint256) {
        return address(this).balance + ethBaseAmount;
    }

    function get_dy(
        int128 from_,
        int128 to_,
        uint256 fromAmount_
    ) external view returns (uint256 toAmount_) {
        if (from_ == ETHID && to_ == STETHID) {
            toAmount_ = _getAmountOutFromETH(fromAmount_, 0);
        } else {
            toAmount_ = _getAmountOutFromStETH(fromAmount_);
        }
    }

    function setEthBaseAmount(uint256 newAmount_) external {
        ethBaseAmount = newAmount_;
    }

    function setStEthBaseAmount(uint256 newAmount_) external {
        stEthBaseAmount = newAmount_;
    }

    function migrateToken(
        address token_,
        address to_,
        uint256 amount_
    ) external {
        if (token_ == address(0)) {
            (bool success_, ) = payable(to_).call{value: amount_}("");
            require(success_, "Fail to transfer native token");
        } else {
            IERC20Upgradeable(token_).safeTransfer(to_, amount_);
        }
    }

    function _getAmountOutFromETH(
        uint256 fromAmount_,
        uint256 receivedAmount_
    ) internal view returns (uint256) {
        uint256 reserveETH_ = getETHBalance();
        reserveETH_ -= receivedAmount_;
        uint256 reserveStETH = getStETHBalance();
        return
            reserveStETH -
            (reserveETH_ * reserveStETH) /
            (reserveETH_ + fromAmount_);
    }

    function _getAmountOutFromStETH(
        uint256 fromAmount_
    ) internal view returns (uint256) {
        uint256 reserveETH_ = getETHBalance();
        uint256 reserveStETH = getStETHBalance();
        return
            reserveETH_ -
            (reserveETH_ * reserveStETH) /
            (reserveStETH + fromAmount_);
    }
}
