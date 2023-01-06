// SPDX-License-Identifier: AGPL 3.0
// Original Copyright Aurora
// Copyright Fathom 2022
pragma solidity 0.8.13;

import "../StakingStructs.sol";

library RewardsLibrary {
    // solhint-disable not-rely-on-time
    function _validateStreamParameters(
        address streamOwner,
        address rewardToken,
        uint256 maxDepositAmount,
        uint256 minDepositAmount,
        uint256[] memory scheduleTimes,
        uint256[] memory scheduleRewards,
        uint256 tau
    ) public view {
        require(streamOwner != address(0), "bad owner");
        require(rewardToken != address(0), "bad reward token");
        require(maxDepositAmount > 0, "No Max Deposit");
        require(minDepositAmount > 0, "No Min Deposit");
        require(minDepositAmount <= maxDepositAmount, "bad Min Deposit");
        require(maxDepositAmount == scheduleRewards[0], "Invalid Max Deposit");
        // scheduleTimes[0] == proposal expiration time
        require(scheduleTimes[0] > block.timestamp, "bad expiration");
        require(scheduleTimes.length == scheduleRewards.length, "bad Schedules");
        require(scheduleTimes.length >= 2, "Schedules short");
        require(tau != 0, "bad Tau");
        for (uint256 i = 1; i < scheduleTimes.length; i++) {
            require(scheduleTimes[i] > scheduleTimes[i - 1], "bad times");
            require(scheduleRewards[i] <= scheduleRewards[i - 1], "bad Rewards");
        }
        require(scheduleRewards[scheduleRewards.length - 1] == 0, "bad End Rewards");
    }

    function _getRewardsAmount(Stream memory stream, uint256 lastUpdate) public view returns (uint256) {
        require(lastUpdate <= block.timestamp, "bad last Update");
        if (lastUpdate == block.timestamp) return 0; // No more rewards since last update
        uint256 streamStart = stream.schedule.time[0];
        if (block.timestamp <= streamStart) return 0; // Stream didn't start
        uint256 streamEnd = stream.schedule.time[stream.schedule.time.length - 1];
        if (lastUpdate >= streamEnd) return 0; // Stream schedule ended, all rewards released
        uint256 start;
        uint256 end;
        if (lastUpdate > streamStart) {
            start = lastUpdate;
        } else {
            // Release rewards from stream start.
            start = streamStart;
        }
        if (block.timestamp < streamEnd) {
            end = block.timestamp;
        } else {
            // The stream already finished between the last update and now.
            end = streamEnd;
        }
        return _getRewardsSchedule(stream, start, end);
    }

    function _getRewardsSchedule(
        Stream memory stream,
        uint256 start,
        uint256 end
    ) internal pure returns (uint256) {
        Schedule memory schedule = stream.schedule;
        uint256 startIndex;
        uint256 endIndex;
        (startIndex, endIndex) = _getStartEndScheduleIndex(stream, start, end);
        uint256 rewardScheduledAmount = 0;
        uint256 reward = 0;
        if (startIndex == endIndex) {
            // start and end are within the same schedule period
            reward = schedule.reward[startIndex] - schedule.reward[startIndex + 1];
            rewardScheduledAmount = (reward * (end - start)) / (schedule.time[startIndex + 1] - schedule.time[startIndex]);
        } else {
            // start and end are not within the same schedule period
            // Reward during the startIndex period
            // Here reward = starting from the actual start time, calculated for the first schedule period
            // that the rewards start.
            reward = schedule.reward[startIndex] - schedule.reward[startIndex + 1];
            rewardScheduledAmount = (reward * (schedule.time[startIndex + 1] - start)) / (schedule.time[startIndex + 1] - schedule.time[startIndex]);
            // Here reward = from end of start schedule till beginning of end schedule
            // Reward during the period from startIndex + 1  to endIndex
            rewardScheduledAmount += schedule.reward[startIndex + 1] - schedule.reward[endIndex];
            // Reward at the end schedule where schedule.time[endIndex]
            reward = schedule.reward[endIndex] - schedule.reward[endIndex + 1];
            rewardScheduledAmount += (reward * (end - schedule.time[endIndex])) / (schedule.time[endIndex + 1] - schedule.time[endIndex]);
        }
        return rewardScheduledAmount;
    }

    function _getStartEndScheduleIndex(
        Stream memory stream,
        uint256 start,
        uint256 end
    ) internal pure returns (uint256 startIndex, uint256 endIndex) {
        Schedule memory schedule = stream.schedule;
        uint256 scheduleTimeLength = schedule.time.length;
        require(scheduleTimeLength > 0, "bad schedules");
        require(end > start, "bad query period");
        require(start >= schedule.time[0], "query before start");
        require(end <= schedule.time[scheduleTimeLength - 1], "query after end");
        for (uint256 i = 1; i < scheduleTimeLength; i++) {
            if (start < schedule.time[i]) {
                startIndex = i - 1;
                break;
            }
        }
        if (end == schedule.time[scheduleTimeLength - 1]) {
            endIndex = scheduleTimeLength - 2;
        } else {
            for (uint256 i = startIndex + 1; i < scheduleTimeLength; i++) {
                if (end < schedule.time[i]) {
                    // Users most often claim rewards within the same index which can last several months.
                    endIndex = i - 1;
                    break;
                }
            }
        }
        require(startIndex <= endIndex, "invalid index");
    }
}
