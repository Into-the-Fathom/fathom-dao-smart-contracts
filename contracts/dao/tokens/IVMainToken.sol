// SPDX-License-Identifier: MIT
// Original Copyright OpenZeppelin Contracts (last updated v4.7.0) (governance/IGovernor.sol)
// Copyright Fathom 2022

pragma solidity 0.8.13;

interface IVMainToken {
    event MemberAddedToWhitelist(address _member);
    event MemberRemovedFromWhitelist(address _member);

    function initToken(address _admin, address _minter) external;

    function addToWhitelist(address _toAdd) external;

    function removeFromWhitelist(address _toRemove) external;

    function pause() external;

    function unpause() external;

    function mint(address to, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function grantMinterRole(address _minter) external;

    function revokeMinterRole(address _minter) external;
}
