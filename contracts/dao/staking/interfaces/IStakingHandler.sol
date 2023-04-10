// SPDX-License-Identifier: AGPL 3.0
// Copyright Fathom 2022

pragma solidity 0.8.16;

import "../StakingStructs.sol";
import "./IStakingGetter.sol";

interface IStakingHandler {
    function initializeStaking(
        address _admin,
        address _vault,
        address _treasury,
        address _mainToken,
        address _voteToken,
        Weight calldata _weight,
        VoteCoefficient calldata voteCoef,
        uint256 _maxLocks,
        address _rewardsContract,
        uint256 _minLockPeriod
    ) external;

    function initializeMainStream(address _owner,
        uint256[] calldata scheduleTimes,
        uint256[] calldata scheduleRewards,
        address _lockPositionContext,
        uint256 tau) external;

    function proposeStream(
        address streamOwner,
        address rewardToken,
        uint256 percentToTreasury,
        uint256 maxDepositAmount,
        uint256 minDepositAmount,
        uint256[] calldata scheduleTimes,
        uint256[] calldata scheduleRewards,
        uint256 tau
    ) external; // only STREAM_MANAGER_ROLE

    function cancelStreamProposal(uint256 streamId) external;

    function createStream(uint256 streamId, uint256 rewardTokenAmount) external;

    function removeStream(uint256 streamId, address streamFundReceiver) external;

    function createLock(uint256 amount, uint256 lockPeriod) external;

    function unlockPartially(uint256 lockId, uint256 amount) external;

    function unlock(uint256 lockId) external;

    function earlyUnlock(uint256 lockId) external;

    function claimAllStreamRewardsForLock(uint256 lockId) external;

    function claimAllLockRewardsForStream(uint256 streamId) external;

    function withdrawStream(uint256 streamId) external;

    function withdrawAllStreams() external;

    function withdrawPenalty() external;

    function updateVault(address _vault) external;

    function emergencyUnlockAndWithdraw() external;

    function createLocksForCouncils(CreateLockParams[] calldata lockParams) external;

    function createLockWithoutEarlyWithdrawal(bytes32 _requestHash) external;

    function setMinimumLockPeriod(uint256 _minLockPeriod) external;

    function setMaxLockPositions(uint256 newMaxLockPositions) external;

    function updateAddresses(address newTreasury, address newLockPositionContext) external;
}
