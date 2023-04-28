// SPDX-License-Identifier: AGPL 3.0
// Copyright Fathom 2022
pragma solidity 0.8.16;
import "../../StakingStructs.sol";
interface IStakingPosition {
    function initialize(
        address _admin,
        address _mainToken,
        address _stakingFactory,
        address _userAccount
    ) external;

    function createLock(uint256 amount, uint256 end) external;
    function claimAllStreamRewardsForLock(uint256 lockId) external;
    function withdrawStream(uint256 streamId) external;
    function withdrawMainStream() external;
    function unlock(uint256 lockId) external;
    function emergencyUnlockAndWithdraw() external;
}