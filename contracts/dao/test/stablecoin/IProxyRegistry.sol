// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.16;

interface IProxyRegistry {
    function proxies(address) external view returns (address);

    function build(address) external returns (address);

    function isProxy(address) external view returns (bool);
}
