// SPDX-License-Identifier: AGPL 3.0
// Copyright Fathom 2022

pragma solidity 0.8.13;

import "../StakingStructs.sol";

interface IStakingGetter {
    function getUsersPendingRewards(address account, uint256 streamId) external view returns (uint256);

    function getStream(uint256 streamId)
        external
        view
        returns (
            address streamOwner,
            address rewardToken,
            uint256 rewardDepositAmount,
            uint256 rewardClaimedAmount,
            uint256 maxDepositAmount,
            uint256 rps,
            uint256 tau,
            StreamStatus status
        );

    function getAllLocks(address account) external view returns (LockedBalance[] memory);

    function getStreamClaimableAmountPerLock(
        uint256 streamId,
        address account,
        uint256 lockId
    ) external view returns (uint256);

    function getStreamSchedule(uint256 streamId) external view returns (uint256[] memory scheduleTimes, uint256[] memory scheduleRewards);

    //  function getStreamsCount() external view returns (uint256);

    //  function getLatestRewardsPerShare(uint256 streamId) external view returns (uint256);

    function getWeight() external view returns (Weight memory);
}
