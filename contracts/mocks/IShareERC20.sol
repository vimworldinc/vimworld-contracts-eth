// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface IShareERC20 {
    /**
     * @notice An executed shares transfer from `sender` to `recipient`.
     *
     * @dev emitted in pair with an ERC20-defined `Transfer` event.
     */
    event TransferShares(
        address indexed from,
        address indexed to,
        uint256 sharesValue
    );

    /**
     * @return the amount of shares that corresponds to `amount` protocol-controlled Token.
     */
    function getShareByPooledToken(
        uint256 amount
    ) external view returns (uint256);

    /**
     * @return the amount of Token that corresponds to `sharesAmount` token shares.
     */
    function getPooledTokenByShares(
        uint256 sharesAmount
    ) external view returns (uint256);

    /**
     * @return the amount of shares belongs to _account.
     */
    function sharesOf(address _account) external view returns (uint256);
}
