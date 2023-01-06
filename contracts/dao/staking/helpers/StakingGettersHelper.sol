// Copyright SECURRENCY INC.
// SPDX-License-Identifier: AGPL 3.0
pragma solidity 0.8.13;

import "./IStakingHelper.sol";
import "./IStakingGetterHelper.sol";
import "../interfaces/IStakingGetter.sol";
import "../StakingStructs.sol";
import "../../../common/access/AccessControl.sol";

contract StakingGettersHelper is IStakingGetterHelper, AccessControl {
    address private stakingContract;
    uint256 internal constant ONE_YEAR = 31536000;
    uint256 internal constant WEEK = 604800;

    constructor(address _stakingContract, address admin) {
        stakingContract = _stakingContract;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function getLockInfo(address account, uint256 lockId) public view override returns (LockedBalance memory) {
        LockedBalance[] memory locks = _getAllLocks(account);
        require(lockId <= locks.length, "out of index");
        require(lockId > 0, "lockId cant be 0");
        return locks[lockId - 1];
    }

    function getLocksLength(address account) public view override returns (uint256) {
        LockedBalance[] memory locks = _getAllLocks(account);
        return locks.length;
    }

    function getLock(address account, uint256 lockId)
        public
        view
        override
        returns (
            uint128,
            uint128,
            uint128,
            uint64,
            address
        )
    {
        LockedBalance[] memory locks = _getAllLocks(account);
        LockedBalance memory lock = locks[lockId - 1];
        require(lockId <= locks.length, "out of index");
        require(lockId > 0, "lockId cant be 0");
        return (lock.amountOfToken, lock.amountOfVoteToken, lock.positionStreamShares, lock.end, lock.owner);
    }

    function getUserTotalDeposit(address account) public view override returns (uint256) {
        LockedBalance[] memory locks = _getAllLocks(account);
        if (locks.length == 0) {
            return 0;
        }
        uint256 totalDeposit = 0;
        for (uint256 lockId = 1; lockId <= locks.length; lockId++) {
            totalDeposit += locks[lockId - 1].amountOfToken;
        }
        return totalDeposit;
    }

    function getStreamClaimableAmount(uint256 streamId, address account) public view override returns (uint256) {
        LockedBalance[] memory locks = _getAllLocks(account);
        if (locks.length == 0) {
            return 0;
        }
        uint256 totalRewards = 0;
        for (uint256 lockId = 1; lockId <= locks.length; lockId++) {
            totalRewards += IStakingHelper(stakingContract).getStreamClaimableAmountPerLock(streamId, account, lockId);
        }
        return totalRewards;
    }

    function getUserTotalVotes(address account) public view override returns (uint256) {
        LockedBalance[] memory locks = _getAllLocks(account);
        if (locks.length == 0) {
            return 0;
        }
        uint256 totalVotes = 0;
        for (uint256 lockId = 1; lockId <= locks.length; lockId++) {
            totalVotes += locks[lockId - 1].amountOfVoteToken;
        }
        return totalVotes;
    }

    function getFeesForEarlyUnlock(uint256 lockId, address account) public view override returns (uint256) {
        LockedBalance[] memory locks = _getAllLocks(account);
        require(lockId <= locks.length, "out of index");
        LockedBalance memory lock = locks[lockId - 1];
        require(lockId > 0, "lockId cant be 0");
        require(lock.end > block.timestamp, "lock opened, no penalty");

        uint256 amount = lock.amountOfToken;
        uint256 lockEnd = lock.end;
        uint256 weighingCoef = _weightedPenalty(lockEnd, block.timestamp);
        uint256 penalty = (weighingCoef * amount) / 100000;
        return penalty;
    }

    function _getAllLocks(address account) internal view returns (LockedBalance[] memory) {
        LockedBalance[] memory locks = IStakingHelper(stakingContract).getAllLocks(account);
        return locks;
    }

    function _weightedPenalty(uint256 lockEnd, uint256 timestamp) internal view returns (uint256) {
        Weight memory weight = _getWeight();
        uint256 maxLockPeriod = IStakingHelper(stakingContract).maxLockPeriod();
        uint256 slopeStart = lockEnd;
        if (timestamp >= slopeStart) return 0;
        uint256 remainingTime = slopeStart - timestamp;

        //why weight multiplier: Because if a person remaining time is less than 12 hours, the calculation
        //would only give minWeightPenalty, because 2900 * 12hours/4days = 0
        return (weight.penaltyWeightMultiplier *
            weight.minWeightPenalty +
            (weight.penaltyWeightMultiplier * (weight.maxWeightPenalty - weight.minWeightPenalty) * remainingTime) /
            maxLockPeriod);
    }

    function _getWeight() internal view returns (Weight memory) {
        return IStakingHelper(stakingContract).getWeight();
    }
}
