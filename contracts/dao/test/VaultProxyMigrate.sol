// SPDX-License-Identifier: AGPL 3.0
// Original Copyright Aurora
// Copyright Fathom 2022
pragma solidity 0.8.16;
import "../../common/proxy/transparent/TransparentUpgradeableProxy.sol";

contract VaultProxyMigrate is TransparentUpgradeableProxy {
    constructor(address _logic, address admin_, bytes memory _data) payable TransparentUpgradeableProxy(_logic, admin_, _data) {}
}
