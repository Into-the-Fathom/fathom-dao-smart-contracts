// SPDX-License-Identifier: MIT
// Copyright Fathom 2022

pragma solidity 0.8.13;

interface ITimelockController {
    function initialize(
        uint256 minDelay,
        address admin,
        address[] calldata proposers,
        address[] calldata executors
    ) external;
}
