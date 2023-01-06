// SPDX-License-Identifier: AGPL 3.0
// Original Copyright Aurora
// Copyright Fathom 2022
pragma solidity 0.8.13;

import "../StakingStructs.sol";

library StakingLibrary {
    function _caclulateAutoCompoundingShares(
        uint256 amount,
        uint256 totalShares,
        uint256 totalAmountOfStakedToken
    ) internal pure returns (uint256) {
        uint256 _amountOfShares = 0;
        if (totalShares == 0) {
            _amountOfShares = amount;
        } else {
            uint256 numerator = amount * totalShares;
            _amountOfShares = numerator / totalAmountOfStakedToken;
            if (_amountOfShares * totalAmountOfStakedToken < numerator) {
                _amountOfShares += 1;
            }
        }

        return _amountOfShares;
    }

    function _getWeightedPenalty(
        uint256 lockEnd,
        uint256 timestamp,
        Weight memory weight,
        uint256 maxLock
    ) internal pure returns (uint256) {
        uint256 slopeStart = lockEnd;
        if (timestamp >= slopeStart) return 0;
        uint256 remainingTime = slopeStart - timestamp;
        //why weight multiplier: Because if a person remaining time is less than 12 hours, the calculation
        //would only give minWeightPenalty, because 2900 * 12hours/4days = 0
        return (weight.penaltyWeightMultiplier *
            weight.minWeightPenalty +
            (weight.penaltyWeightMultiplier * (weight.maxWeightPenalty - weight.minWeightPenalty) * remainingTime) /
            maxLock);
    }
}
