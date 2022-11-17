// SPDX-License-Identifier: AGPL 3.0
// Original Copyright Aurora
// Copyright Fathom 2022
pragma solidity 0.8.13;
import "../vault/packages/VaultPackage.sol";
interface IVaultUpgrade{
     function getIsSupportedToken(address token) view external returns (bool);
}
contract VaultUpgrade is VaultPackage,IVaultUpgrade {
    
    function getIsSupportedToken(address token) public view override returns (bool) {
        return isSupportedToken[token];
    }
}