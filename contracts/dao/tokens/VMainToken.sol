// SPDX-License-Identifier: MIT
// Copyright Fathom 2022

pragma solidity 0.8.13;

import "../../common/security/Pausable.sol";
import "../../common/access/AccessControl.sol";
import "./ERC20/extensions/ERC20Votes.sol";
import "./IVMainToken.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract VMainToken is IVMainToken, Pausable, AccessControl, Initializable, ERC20Votes {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");
    bool private initialized;
    // Mapping to keep track of who is allowed to transfer voting tokens
    mapping(address => bool) public isWhiteListed;

    constructor(string memory name_, string memory symbol_) ERC20Votes(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function initToken(address _admin, address _minter) public override initializer onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_admin != msg.sender, "initToken: Admin should be different than msg.sender");
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(MINTER_ROLE, _minter);
        _grantRole(WHITELISTER_ROLE, _admin);

        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);

        isWhiteListed[_minter] = true;
        emit MemberAddedToWhitelist(_minter);
    }

    function addToWhitelist(address _toAdd) public override onlyRole(WHITELISTER_ROLE) {
        isWhiteListed[_toAdd] = true;
        emit MemberAddedToWhitelist(_toAdd);
    }

    function removeFromWhitelist(address _toRemove) public override onlyRole(WHITELISTER_ROLE) {
        isWhiteListed[_toRemove] = false;
        emit MemberRemovedFromWhitelist(_toRemove);
    }

    function grantMinterRole(address _minter) public override onlyRole(getRoleAdmin(MINTER_ROLE)) {
        _grantRole(MINTER_ROLE, _minter);
        addToWhitelist(_minter);
    }

    function revokeMinterRole(address _minter) public override onlyRole(getRoleAdmin(MINTER_ROLE)) {
        _grantRole(MINTER_ROLE, _minter);
        removeFromWhitelist(_minter);
    }

    function pause() public override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mint(address to, uint256 amount) public override onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        _delegate(to, to);
    }

    function burn(address account, uint256 amount) public override onlyRole(MINTER_ROLE) {
        _burn(account, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        require(isWhiteListed[msg.sender], "VMainToken: is intransferable unless the sender is whitelisted");
        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._afterTokenTransfer(from, to, amount);
    }
}
