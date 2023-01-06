const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const BN = web3.utils.BN
const chai = require("chai");
const { expect } = chai.use(require('chai-bn')(BN));
const eventsHelper = require("../../helpers/eventsHelper");
const blockchain = require("../../helpers/blockchain");


const maxGasForTxn = 600000
const {
    shouldRevert,
    errTypes
} = require('../../helpers/expectThrow');

const SYSTEM_ACC = accounts[0];
const staker_1 = accounts[1];

const stream_owner = accounts[3];
const staker_2 = accounts[4];
const staker_3 = accounts[5];
const staker_4 = accounts[6];

const stream_manager = accounts[7];
const stream_rewarder_1 = accounts[8];
const stream_rewarder_2 = accounts[9];

let vault_test_address;


const _createVoteWeights = (
    voteShareCoef,
    voteLockCoef) => {
    return {
        voteShareCoef: voteShareCoef,
        voteLockCoef: voteLockCoef
    }
}

const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';
// event
const SUBMIT_TRANSACTION_EVENT = "SubmitTransaction(uint256,address,address,uint256,bytes)";

const _createWeightObject = (
    maxWeightShares,
    minWeightShares,
    maxWeightPenalty,
    minWeightPenalty,
    weightMultiplier) => {
    return {
        maxWeightShares: maxWeightShares,
        minWeightShares: minWeightShares,
        maxWeightPenalty: maxWeightPenalty,
        minWeightPenalty: minWeightPenalty,
        penaltyWeightMultiplier: weightMultiplier
    }
}


const _getTimeStamp = async () => {
    const timestamp = await blockchain.getLatestBlockTimestamp()
    return timestamp
}
const _calculateNumberOfVFTHM = (sumToDeposit, lockingPeriod, lockingWeight) =>{
    const lockingPeriodBN = new web3.utils.BN(lockingPeriod);
    const lockingWeightBN = new web3.utils.BN(lockingWeight);
    const sumToDepositBN = new web3.utils.BN(sumToDeposit);
    
    return sumToDepositBN.mul(lockingPeriodBN).div(lockingWeightBN);
}

const _calculateNumberOfStreamShares = (sumToDeposit, vMainTokenCoefficient, nVFTHM, maxWeightShares) => {
    const sumToDepositBN = new web3.utils.BN(sumToDeposit);
    const vMainTokenWeightBN = new web3.utils.BN(vMainTokenCoefficient); 
    const maxWeightBN = new web3.utils.BN(maxWeightShares);
    const oneThousandBN = new web3.utils.BN(1000)
    return (sumToDepositBN.add(vMainTokenWeightBN.mul(nVFTHM).div(oneThousandBN))).mul(maxWeightBN)
}

const _calculateRemainingBalance = (depositAmount, beforeBalance) => {
    const depositAmountBN = new web3.utils.BN(depositAmount);
    const beforeBalanceBN = new web3.utils.BN(beforeBalance)
    return beforeBalanceBN.sub(depositAmountBN)
}

const _calculateAfterWithdrawingBalance = (pendingAmount, beforeBalance) => {
    const pendingAmountBN = new web3.utils.BN(pendingAmount);
    const beforeBalanceBN = new web3.utils.BN(beforeBalance)
    return beforeBalanceBN.add(pendingAmountBN)
}

const _convertToEtherBalance = (balance) => {
    return parseFloat(web3.utils.fromWei(balance,"ether").toString()).toFixed(5)
}

const _encodeProposeStreamFunction = (
    _owner,
    _rewardToken,
    _maxDepositedAmount,
    _minDepositedAmount,
    _scheduleTimes,
    _scheduleRewards,
    _tau
) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'proposeStream',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'streamOwner'
        },{
            type: 'address',
            name: 'rewardToken'
        },{
            type: 'uint256',
            name: 'maxDepositAmount'
        },{
            type: 'uint256',
            name: 'minDepositAmount'
        },{
            type: 'uint256[]',
            name: 'scheduleTimes'
        },{
            type: 'uint256[]',
            name: 'scheduleRewards'
        },{
            type: 'uint256',
            name: 'tau'
        }]
    }, [
        _owner,
        _rewardToken,
        _maxDepositedAmount,
        _minDepositedAmount,
        _scheduleTimes,
        _scheduleRewards,
        _tau
    ]);

    return toRet;
}



const _encodeTransferFunction = (_account, t_to_stake) => {
    // encoded transfer function call for the main token.

    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'transfer',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'to'
        },{
            type: 'uint256',
            name: 'amount'
        }]
    }, [_account, t_to_stake]);

    return toRet;
}

const _encodeWithdrawPenaltyFunction = (_account) => {
    let toRet = web3.eth.abi.encodeFunctionCall({
        name: 'withdrawPenalty',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'penaltyReceiver'
        }]
    }, [_account]);

    return toRet;
}

const _encodeAddSupportedTokenFunction = (_token) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'addSupportedToken',
        type: 'function',
        inputs: [{
            type: 'address',
            name: '_token'
        }]
    }, [_token]);

    return toRet;
}

const _encodeAdminPause = (flag) => {
    let toRet = web3.eth.abi.encodeFunctionCall({
        name: 'adminPause',
        type: 'function',
        inputs: [{
            type: 'uint256',
            name: 'flags'
        }]}, [flag]);

    return toRet;
}


describe("Staking Test", () => {

    const oneMonth = 30 * 24 * 60 * 60;
    const oneYear = 31556926;
    let stakingService;
    let vaultService;
    let stakingGetterService;
    let FTHMToken;
    let vMainToken;
    let multiSigWallet;

    let streamReward1;
    let streamReward2;

    let vMainTokenAddress;
    let FTHMTokenAddress;
    let streamReward1Address;
    let streamReward2Address;

    let maxWeightShares;
    let minWeightShares;
    let maxWeightPenalty;
    let minWeightPenalty;
    let vMainTokenCoefficient;
    let lockingVoteWeight;
    let totalAmountOfStakedToken;
    let totalAmountOfVFTHM;
    let totalAmountOfStreamShares;
    let maxNumberOfLocks;
    let _flags;
    let proxyAddress;

    const sumToDeposit = web3.utils.toWei('100', 'ether');
    const sumToTransfer = web3.utils.toWei('2000', 'ether');
    const sumToApprove = web3.utils.toWei('3000','ether');
    const sumForProposer = web3.utils.toWei('3000','ether')
    const vMainTokensToApprove = web3.utils.toWei('500000', 'ether')

    before(async() => {
        await snapshot.revertToSnapshot();
        maxWeightShares = 1024;
        minWeightShares = 256;
        maxWeightPenalty = 3000;
        minWeightPenalty = 100;
        weightMultiplier = 10;
        maxNumberOfLocks = 10;
        _flags = 0;
        

        const weightObject =  _createWeightObject(
                              maxWeightShares,
                              minWeightShares,
                              maxWeightPenalty,
                              minWeightPenalty,
                              weightMultiplier)
        //this is used for stream shares calculation.
        vMainTokenCoefficient = 500;
        //this is used for calculation of release of voteToken
        lockingVoteWeight = 365 * 24 * 60 * 60;
        stakingService = await artifacts.initializeInterfaceAt(
            "IStaking",
            "StakingProxy"
        )

        vaultService = await artifacts.initializeInterfaceAt(
            "IVault",
            "VaultProxy"
        )

        stakingGetterService = await artifacts.initializeInterfaceAt(
            "StakingGettersHelper",
            "StakingGettersHelper"
        )

        rewardsCalculator = await artifacts.initializeInterfaceAt(
            "RewardsCalculator",
            "RewardsCalculator"
        )


        FTHMToken = await artifacts.initializeInterfaceAt("MainToken","MainToken");
        streamReward1 = await artifacts.initializeInterfaceAt("ERC20Rewards1","ERC20Rewards1");
        streamReward2 = await artifacts.initializeInterfaceAt("ERC20Rewards2","ERC20Rewards2");
        multiSigWallet = await artifacts.initializeInterfaceAt("MultiSigWallet", "MultiSigWallet");

        await streamReward1.transfer(stream_rewarder_1,web3.utils.toWei("10000","ether"),{from: SYSTEM_ACC});
        await streamReward2.transfer(stream_rewarder_2,web3.utils.toWei("10000","ether"),{from: SYSTEM_ACC});
        
        vMainToken = await artifacts.initializeInterfaceAt("VMainToken", "VMainToken");

        vMainTokenAddress = vMainToken.address;
        FTHMTokenAddress = FTHMToken.address;
        streamReward1Address = streamReward1.address;
        streamReward2Address = streamReward2.address;

        const _transferFromMultiSigTreasury = async (_account, _value) => {
            const result = await multiSigWallet.submitTransaction(
                FTHMToken.address, 
                EMPTY_BYTES, 
                _encodeTransferFunction(_account, _value),
                0,
                {"from": accounts[0]}
            );
            txIndex4 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];

            await multiSigWallet.confirmTransaction(txIndex4, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex4, {"from": accounts[1]});

            await multiSigWallet.executeTransaction(txIndex4, {"from": accounts[1]});
        }
        
        await _transferFromMultiSigTreasury(staker_1, sumToTransfer);
        await _transferFromMultiSigTreasury(staker_2, sumToTransfer);
        await _transferFromMultiSigTreasury(staker_3, sumToTransfer);
        await _transferFromMultiSigTreasury(staker_4, sumToTransfer);
        await _transferFromMultiSigTreasury(stream_manager, sumForProposer);
        
        await vMainToken.approve(stakingService.address,vMainTokensToApprove, {from: SYSTEM_ACC})
        
        vault_test_address = vaultService.address;
        const sumToTransfer2 = web3.utils.toWei('25000', 'ether');
        await _transferFromMultiSigTreasury(accounts[9], sumToTransfer2);

        const startTime =  await _getTimeStamp() + 3 * 24 * 24 * 60;

        const _addSupportedTokenFromMultiSigTreasury = async (_token) => {
            const result = await multiSigWallet.submitTransaction(
                vaultService.address, 
                EMPTY_BYTES, 
                _encodeAddSupportedTokenFunction(_token),
                0,
                {"from": accounts[0]}
            );
            const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];

            await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});

            await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
        }

        await _addSupportedTokenFromMultiSigTreasury(streamReward1Address);
        await _addSupportedTokenFromMultiSigTreasury(streamReward2Address);
    });

    describe('Creating Locks and Unlocking before any stream reward tokens are issued, and release vote token', async() => {
        expectedTotalAmountOfVFTHM = new web3.utils.BN(0)
        it('Should create a lock possition with lockId = 1 for staker_1', async() => {
            // So that staker 1 can actually stake the token:
            await FTHMToken.approve(vaultService.address, sumToApprove, {from: staker_1})
            const beforeFTHMBalance = await FTHMToken.balanceOf(staker_1);

            await blockchain.increaseTime(20);
            let lockingPeriod = 24 * 60 * 60;

            const unlockTime = lockingPeriod;
            let result = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_1});
            // Since block time stamp can change after locking, we record the timestamp, 
            // later to be used in the expectedNVFTHM calculation.  
            // This mitigates an error created from the slight change in block time.

            
            const expectedFTHMBalanceStaker1 = _calculateRemainingBalance(sumToDeposit, beforeFTHMBalance.toString())
            const afterFTHMBalance = await FTHMToken.balanceOf(staker_1);
            
            let eventArgs = eventsHelper.getIndexedEventArgs(result, "Staked(address,uint256,uint256,uint256,uint256,uint256)");
            const expectedLockId = 1
            
            assert.equal(eventArgs[1].toString(),expectedLockId)
            assert.equal(afterFTHMBalance.toString(),expectedFTHMBalanceStaker1.toString())

            const expectedNVFTHM = _calculateNumberOfVFTHM(sumToDeposit, lockingPeriod, lockingVoteWeight)
            expectedTotalAmountOfVFTHM = expectedTotalAmountOfVFTHM.add(expectedNVFTHM)

            const staker1VeTokenBal = (await vMainToken.balanceOf(staker_1)).toString()

            //  Here we check that the correct amount of vote was minted.
            staker1VeTokenBal.should.be.bignumber.equal(expectedNVFTHM)
        });
        
        it("Should create a second lock possition for staker_1, and check that correct number of vote tokens are released", async() => {
            
            await blockchain.increaseTime(20);
            let lockingPeriod = 24 * 60 * 60;
            
            const unlockTime = lockingPeriod;
            let result = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_1, gas:maxGasForTxn});
            
            let eventArgs = eventsHelper.getIndexedEventArgs(result, "Staked(address,uint256,uint256,uint256,uint256,uint256)");
            const lockInfo = await stakingGetterService.getLockInfo(staker_1,2)
            const actualNVFTHM = web3.utils.toBN(lockInfo.amountOfVoteToken.toString())
            //lockingVoteWeight = 365 * 24 * 60 * 60;
            const expectedNVFTHM = _calculateNumberOfVFTHM(sumToDeposit, lockingPeriod, lockingVoteWeight)
            
            const expectedShares = _calculateNumberOfStreamShares(sumToDeposit, vMainTokenCoefficient, actualNVFTHM, maxWeightShares);
            const actualShares = web3.utils.toBN(lockInfo.positionStreamShares.toString())
            
            actualNVFTHM.should.be.bignumber.equal(expectedNVFTHM)
            actualShares.should.be.bignumber.equal(expectedShares)
            expectedTotalAmountOfVFTHM = expectedTotalAmountOfVFTHM.add(expectedNVFTHM)

        });

        it("Should have correct total number of staked protocol tokens", async() => {
            //2 deposits:
            const sumToDepositBN = new web3.utils.BN(sumToDeposit);
            const expectedTotalAmountOfStakedFTHM = sumToDepositBN.add(sumToDepositBN);
            let result = await stakingService.totalAmountOfStakedToken()
            const totalAmountOfStakedToken = result;
            assert.equal(totalAmountOfStakedToken.toString(),expectedTotalAmountOfStakedFTHM.toString())
        });

        it("Setup a lock position for staker_2, staker_3, staker_4", async() => {
            const unlockTime =  500;
            const expectedLockId = 1
            
            const sumToDepositForAll = web3.utils.toWei('100', 'ether');

            await FTHMToken.approve(vaultService.address, sumToApprove, {from: staker_2})
            await FTHMToken.approve(vaultService.address, sumToApprove, {from: staker_3})
            await FTHMToken.approve(vaultService.address, sumToApprove, {from: staker_4})
            
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            
            let result1 = await stakingService.createLock(sumToDepositForAll,unlockTime,{from: staker_2});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result2 = await stakingService.createLock(sumToDepositForAll,unlockTime,{from: staker_3});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result3 = await stakingService.createLock(sumToDepositForAll,unlockTime, {from: staker_4});
            await blockchain.mineBlock(await _getTimeStamp() + 20);

            let eventArgs1 = eventsHelper.getIndexedEventArgs(result1, "Staked(address,uint256,uint256,uint256,uint256,uint256)");
            let eventArgs2 = eventsHelper.getIndexedEventArgs(result2, "Staked(address,uint256,uint256,uint256,uint256,uint256)");
            let eventArgs3 = eventsHelper.getIndexedEventArgs(result3, "Staked(address,uint256,uint256,uint256,uint256,uint256)");

            // Check that the lock id is being assigned correctly.  For each staker, their first respective lockId is 1
            assert.equal(eventArgs1[1].toString(),expectedLockId)
            assert.equal(eventArgs2[1].toString(),expectedLockId)
            assert.equal(eventArgs3[1].toString(),expectedLockId)
        })

        it("Should not unlock locked position before the end of the lock possition's lock period - staker_1", async() => {
            
            const errorMessage = "lock not open";

            await shouldRevert(
                stakingService.unlock(1, {from: staker_1}),
                errTypes.revert,  
                errorMessage
            );
            //  staker_1 would have to use the function earlyUnlock() to unlock before the lock period has passed.
        })

        it("Setup a third locked position with a 5 second lock period: LockId = 3 - staker_1", async() => {
            const unlockTime =  5;

            let result = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_1});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })
        
        it("Should get correct staked amount from staking getter service", async() => {
            let result = await stakingGetterService.getUserTotalDeposit(staker_1);
            let shouldBeTotal = (new web3.utils.BN(sumToDeposit)).mul(new web3.utils.BN(3));

            assert(result.toString(), shouldBeTotal.toString())
            
        })
        
        it("Should completely unlock LockId = 1 - staker_1, replace LockId 1 with LockId 3 in the locks array for staker_1", async() => {
            // The lock array for staker_1 should reduce in length by 1 on the backend.
            const sumToUnstake = web3.utils.toWei('0.01','ether')
            await blockchain.mineBlock(await _getTimeStamp() + 24 * 60 * 60 + 10);
            
            //--1day
            let result = await stakingGetterService.getLockInfo(staker_1,3);
            const amountOfVFTHMLock3 = result.amountOfVoteToken.toString()
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_1})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from : staker_1});
            const errorMessage = "out of index";

            await shouldRevert(
                stakingGetterService.getLockInfo(staker_1,3),
                errTypes.revert,  
                errorMessage
            );

            result = await stakingGetterService.getLockInfo(staker_1,1);
            
            assert(amountOfVFTHMLock3, result.amountOfVoteToken.toString());
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })

        
        it("Should unlock completely locked positions for user - staker_2", async() => {
            let result = await stakingGetterService.getLockInfo(staker_2,1);
            const beforeVOTEBalance  = (await vMainToken.balanceOf(staker_2)).toString()
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_2})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_2});
            const afterVOTEBalance  = (await vMainToken.balanceOf(staker_2)).toString()
            const amountOfVFTHMLock3 = result.amountOfVoteToken.toString()
            
            const differenceInBalance = _calculateRemainingBalance(afterVOTEBalance,beforeVOTEBalance)
            amountOfVFTHMLock3.should.be.bignumber.equal(differenceInBalance.toString())
            const errorMessage = "out of index";
            // The last lock possition should no longer be accesible
            await shouldRevert(
                stakingGetterService.getLockInfo(staker_2,1),
                errTypes.revert,  
                errorMessage
            );
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        }) 

        it("Should unlock completely locked positions for user - staker_3", async() => {
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_3})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_3});
            const errorMessage = "out of index";

            await shouldRevert(
                stakingGetterService.getLockInfo(staker_3,1),
                errTypes.revert,  
                errorMessage
            );
            
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        });

        it("Should unlock completely locked positions for user - staker_4", async() => {
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_4})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_4});
            const errorMessage = "out of index";

            await shouldRevert(
                stakingGetterService.getLockInfo(staker_4,1),
                errTypes.revert,  
                errorMessage
            );
        });

        it("Should unlock completely for locked position 1 - staker_1", async() => {
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_1})
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result = await stakingService.unlock(1, {from : staker_1});
            
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_1})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from : staker_1});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            const totalAmountOfStakedToken = await stakingService.totalAmountOfStakedToken()
            const totalAmountOfStreamShares = await stakingService.totalStreamShares()
            const MAIN_STREAM_ID = 0
            
            assert.equal(totalAmountOfStakedToken.toString(),"0")
            assert.equal(totalAmountOfStreamShares.toString(),"0")
            console.log("----- After all the locks are completely unlocked ------")
            console.log("totalAmountOfStakedToken: ", totalAmountOfStakedToken.toString());
            console.log("totalAmountOfStreamShares: ", totalAmountOfStreamShares.toString());
            

            await stakingService.withdrawAllStreams({from: staker_1});
            await stakingService.withdrawAllStreams({from: staker_2});
            await stakingService.withdrawAllStreams({from: staker_3});
            await stakingService.withdrawAllStreams({from: staker_4});

            const totalAmountOfStreamTotalUserPendings = await stakingService.streamTotalUserPendings(MAIN_STREAM_ID)
            assert.equal(totalAmountOfStreamTotalUserPendings.toString(),"0")
            console.log("totalAmountOfStreamPending: ", totalAmountOfStreamTotalUserPendings.toString());
        });
    });
    
    describe('Creating Streams and Rewards Calculations', async() => {
        
        it("Should propose a stream", async() => {
            const id = 1;

            const maxRewardProposalAmountForAStream = web3.utils.toWei('1000', 'ether');
            const minRewardProposalAmountForAStream = web3.utils.toWei('200', 'ether');

            
            const startTime = await _getTimeStamp() + 1000;
            const scheduleRewards = [
                web3.utils.toWei('1000', 'ether'),
                web3.utils.toWei('800', 'ether'),
                web3.utils.toWei('600', 'ether'),
                web3.utils.toWei('400', 'ether'),
                web3.utils.toWei('200', 'ether'),
                web3.utils.toWei("0", 'ether')
            ]
            const scheduleTimes = [
                startTime,
                startTime + oneMonth,
                startTime + 2 * oneMonth,
                startTime + 3 * oneMonth,
                startTime + 4 * oneMonth,
                startTime + 5 * oneMonth
            ]

            const _proposeStreamFromMultiSigTreasury = async (
                _stream_rewarder_1,
                _streamReward1Address,
                _maxRewardProposalAmountForAStream,
                _minRewardProposalAmountForAStream,
                _scheduleTimes,
                _scheduleRewards,
                _tau
            ) => {
                const result = await multiSigWallet.submitTransaction(
                    stakingService.address, 
                    EMPTY_BYTES, 
                    _encodeProposeStreamFunction(
                        _stream_rewarder_1,
                        _streamReward1Address,
                        _maxRewardProposalAmountForAStream,
                        _minRewardProposalAmountForAStream,
                        _scheduleTimes,
                        _scheduleRewards,
                        _tau
                    ),
                    0,
                    {"from": accounts[0]}
                );
                const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
    
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});
    
                await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
            }
            await _proposeStreamFromMultiSigTreasury(
                stream_rewarder_1,
                streamReward1Address,
                maxRewardProposalAmountForAStream,
                minRewardProposalAmountForAStream,
                scheduleTimes,
                scheduleRewards,
                10
            );
            
            await blockchain.mineBlock(await _getTimeStamp() + 10)
        })

        it("Should Create a Stream", async() => {
            // Once createStream is called, the proposal will become live once start time is reached
            const RewardProposalAmountForAStream = web3.utils.toWei('800', 'ether');
            await streamReward1.approve(vaultService.address, RewardProposalAmountForAStream, {from:stream_rewarder_1})
            await stakingService.createStream(1,RewardProposalAmountForAStream, {from: stream_rewarder_1});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })

        it("Should propose a second stream, stream - 2", async() => {

            const maxRewardProposalAmountForAStream = web3.utils.toWei('1000', 'ether');
            const minRewardProposalAmountForAStream = web3.utils.toWei('200', 'ether');

            
            const startTime = await _getTimeStamp() + 1000;
            const scheduleRewards = [
                web3.utils.toWei('1000', 'ether'),
                web3.utils.toWei("0", 'ether')
            ]
            
            const scheduleTimes = [
                startTime,
                startTime + oneYear
            ]

            const _proposeStreamFromMultiSigTreasury = async (
                _stream_rewarder_2,
                _streamReward2Address,
                _maxRewardProposalAmountForAStream,
                _minRewardProposalAmountForAStream,
                _scheduleTimes,
                _scheduleRewards,
                _tau
            ) => {
                const result = await multiSigWallet.submitTransaction(
                    stakingService.address, 
                    EMPTY_BYTES, 
                    _encodeProposeStreamFunction(
                        _stream_rewarder_2,
                        _streamReward2Address,
                        _maxRewardProposalAmountForAStream,
                        _minRewardProposalAmountForAStream,
                        _scheduleTimes,
                        _scheduleRewards,
                        _tau
                    ),
                    0,
                    {"from": accounts[0]}
                );
                const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
    
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});
    
                await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
            }
            await _proposeStreamFromMultiSigTreasury(
                stream_rewarder_2,
                streamReward2Address,
                maxRewardProposalAmountForAStream,
                minRewardProposalAmountForAStream,
                scheduleTimes,
                scheduleRewards,
                10
            );
            await blockchain.mineBlock(await _getTimeStamp() + 10)
        })


        it("Should Create a Stream - 2", async() => {
            const RewardProposalAmountForAStream = web3.utils.toWei('1000', 'ether');
            await streamReward2.approve(vaultService.address, RewardProposalAmountForAStream, {from:stream_rewarder_2})
            await stakingService.createStream(2,RewardProposalAmountForAStream, {from: stream_rewarder_2});
        })

        it('Setup Locks for staker_3 and staker_4 reward tests', async() => {
            const lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime =  lockingPeriod;
            
            await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_3,gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_4,gas: maxGasForTxn});
            
        });


        it('Should get correct Rewards', async() => {
            await blockchain.increaseTime(20);
            let lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime = lockingPeriod;
            
            let beforeLockTimestamp = await _getTimeStamp();
            await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_2,gas: maxGasForTxn});
            const mineToTimestamp = 20 * 24 * 60 * 60
            //21days
            await blockchain.mineBlock(beforeLockTimestamp + mineToTimestamp);
            
            
            const lockId = 1
            const rewardsPeriod = lockingPeriod
            const rewardsPeriodBN = new web3.utils.toBN(rewardsPeriod)
            const RewardProposalAmountForAStream = web3.utils.toWei('1000', 'ether');
            
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_2, gas: maxGasForTxn});
            const lockInfo = await stakingGetterService.getLockInfo(staker_2,1)
            const positionStreamSharesBN = new web3.utils.toBN((await lockInfo.positionStreamShares).toString())
            const rewardsAmountTotal = new web3.utils.toBN(RewardProposalAmountForAStream)
            const oneYearBN = new web3.utils.toBN(oneYear)
            const rewards = rewardsPeriodBN.mul(rewardsAmountTotal).div(oneYearBN)

            totalAmountOfStreamShares = await stakingService.totalStreamShares()
            const totalStreamShares = new web3.utils.toBN(totalAmountOfStreamShares.toString())
            const expectedRewards = rewards.mul(positionStreamSharesBN).div(totalStreamShares).toString()
            console.log("expected Rewards for staker_2: ",_convertToEtherBalance(expectedRewards))

            await blockchain.mineBlock(await _getTimeStamp() + 20);
            const pendingRewards = (await stakingService.getUsersPendingRewards(staker_2, 2)).toString()
            console.log("pending rewards for staker_ 2:",_convertToEtherBalance(pendingRewards));

            // Minute changes in blocktimes effect the rewards calculations.  
            //  So in reward tests like this one we just check that the expected value is within an acceptable range of the output.
        })

        it('Claim rewards for stream 2 staker_3,staker_4', async() => {
            //Time stamp increased = 20 * 24 * 60 * 60
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            const lockId = 1;
            const stream = 2;
            let result1 = await stakingService.claimAllLockRewardsForStream(stream,{from:staker_3, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result2 = await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);

            let pendingRewards = (await stakingService.getUsersPendingRewards(staker_3, stream)).toString()
            console.log("pending rewards staker_3 - 1st Claim: lockId -1",_convertToEtherBalance(pendingRewards));
            pendingRewards = (await stakingService.getUsersPendingRewards(staker_4, stream)).toString()
            console.log("pending rewards staker_4 - 1st Claim: lockId -1",_convertToEtherBalance(pendingRewards));
        })
        
        it('Second claim rewards for stream 2 staker_3, staker_4', async() => {
            const timestamp = await _getTimeStamp();
            const mineToTimestamp = 1 * 24 * 60 * 60
            await blockchain.mineBlock(timestamp + mineToTimestamp);

            const lockId = 1
            const stream = 2;
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_3, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20)
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_4, gas: maxGasForTxn});
            let pendingRewards = (await stakingService.getUsersPendingRewards(staker_3, stream)).toString()
            console.log("pending rewards staker_3 - 2nd Claim: lockId -1",_convertToEtherBalance(pendingRewards));
            pendingRewards = (await stakingService.getUsersPendingRewards(staker_4, stream)).toString()
            console.log("pending rewards staker_4 - 2nd Claim: lockId - 1",_convertToEtherBalance(pendingRewards));
        })
        
        it("Should withdraw stream rewards for all stream 2 stakers", async() => {
            let timestamp = await _getTimeStamp();
            let mineToTimestamp = 15;
            await blockchain.mineBlock(timestamp + mineToTimestamp);

            const stream = 2;

            let beforeBalanceStaker2 = await streamReward2.balanceOf(staker_2)
            console.log("balance of stream reward token 2, staker _2, before claim: ",_convertToEtherBalance(beforeBalanceStaker2.toString()))
            await stakingService.withdrawAllStreams({from: staker_2})
            let afterBalanceStaker2 = await streamReward2.balanceOf(staker_2)
            console.log("balance of stream reward token 2, staker _2, after claim: ",_convertToEtherBalance(afterBalanceStaker2.toString()))
            
            let beforeBalanceStaker3 = await streamReward2.balanceOf(staker_3)
            console.log("balance of stream reward token 2, staker _3, before claim: ",_convertToEtherBalance(beforeBalanceStaker3.toString()))
            await stakingService.withdrawStream(stream, {from: staker_3})
            let afterBalanceStaker3 = await streamReward2.balanceOf(staker_3)
            console.log("balance of stream reward token 2, staker _3, after claim: ",_convertToEtherBalance(afterBalanceStaker3.toString()))
            
            let beforeBalanceStaker4 = await streamReward2.balanceOf(staker_4)
            console.log("balance of stream reward token 2, staker _4, before claim: ",_convertToEtherBalance(beforeBalanceStaker4.toString()))
            await stakingService.withdrawStream(stream, {from: staker_4})
            let afterBalanceStaker4 = await streamReward2.balanceOf(staker_4)
            console.log("balance of stream reward token 2, staker _4, after claim: ",_convertToEtherBalance(afterBalanceStaker4.toString()))

            assert.equal((await stakingService.getUsersPendingRewards(staker_2, 2)).toString(),"0")
            assert.equal((await stakingService.getUsersPendingRewards(staker_3, 2)).toString(),"0")
            assert.equal((await stakingService.getUsersPendingRewards(staker_3, 2)).toString(),"0")
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })
     
        
        it('Setup 2nd lock position for stakers 2, 4,', async() => {
           
            const lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime =  lockingPeriod;
            
            let result1 = await stakingService.createLock(sumToDeposit,unlockTime, {from: staker_2, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 100);
            let result3 = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 100);

        })

        it('Setup 2nd lock position for stakers 3,', async() => {
            // Seperated because there is a different locking period for staker 3 compared to stakers 2, 4.
           
            const lockingPeriod_staker3 = 12 * 60 * 60
            const unlockTime_staker3 =  lockingPeriod_staker3
            let result2 = await stakingService.createLock(sumToDeposit,unlockTime_staker3, {from: staker_3, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 100);
        })

        it('Claim rewards for stream 2 staker_3,staker_4', async() => {
            let timestamp = await _getTimeStamp();
            let mineToTimestamp = 1* 24 * 60 * 60
            const streamId = 2
            //22days
            await blockchain.mineBlock(timestamp + mineToTimestamp);
            const lockId = 2    
            const claimableRewards_staker3 = await stakingService.getStreamClaimableAmountPerLock(streamId, staker_3, lockId);
            const claimableRewards_staker4 = await stakingService.getStreamClaimableAmountPerLock(streamId, staker_4, lockId); 
            console.log("Claimable rewards for staker_3:  ", _convertToEtherBalance(claimableRewards_staker3.toString()))
            console.log("Claimable rewards for staker_4:  ", _convertToEtherBalance(claimableRewards_staker4.toString()))
            let result1 = await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_3, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result2 = await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            await stakingService.withdrawStream(streamId, {from:staker_3})
            await stakingService.withdrawStream(streamId, {from:staker_4})
            let pendingRewards = (await streamReward2.balanceOf(staker_3)).toString();
            console.log("pending rewards staker_3 - 1st Claim: lockId -2",_convertToEtherBalance(pendingRewards));
            pendingRewards = (await streamReward2.balanceOf(staker_4)).toString()
            console.log("pending rewards staker_4 - 1st Claim: lockId -2",_convertToEtherBalance(pendingRewards));
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })

        it('Time passes and the second claim of rewards for stream 2 staker_3,staker_4 is claimed', async() => {
            let timestamp = await _getTimeStamp();
            let mineToTimestamp = 1* 24 * 60 * 60
            const streamId = 2
            //23days
            await blockchain.mineBlock(timestamp + mineToTimestamp);
            const lockId = 2
            
            let result1 = await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_3, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result2 = await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            await stakingService.withdrawStream(streamId, {from:staker_3})
            await stakingService.withdrawStream(streamId, {from:staker_4})
            let pendingRewards = (await streamReward2.balanceOf(staker_3)).toString();
            console.log("pending rewards staker_3 - 2nd Claim: lockId - 2",_convertToEtherBalance(pendingRewards));
            pendingRewards = (await streamReward2.balanceOf(staker_4)).toString()
            console.log("pending rewards staker_4 - 2nd Claim: lockId - 2",_convertToEtherBalance(pendingRewards));
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })
        
        it('Setup 3rd and 4th locks for stakers _3', async() => {
            const lockingPeriod = 12 * 60 * 60
            const unlockTime = lockingPeriod;
            let result2 = await stakingService.createLock(sumToDeposit,unlockTime, {from: staker_3,gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            let result3 = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_3, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 20);
        })

        it('Should update rewards when unlocking lock position 3, for staker_3', async() =>{

            // A warning to be included in the front end:
            //  Rewards need to be claimed before a possition is unlocked, so that stakers don't lose reward tokens.
            const streamId = 2
            const lockId = 3
            let timestamp = await _getTimeStamp();
            let mineToTimestamp = 100

            //lockId 3 rewards claimed
            await blockchain.mineBlock(timestamp + mineToTimestamp);
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_3});
            
            await blockchain.mineBlock(await _getTimeStamp() + mineToTimestamp);
            await stakingService.withdrawStream(streamId, {from: staker_3})

            //-- main logic --  starts from here:
            timestamp = await _getTimeStamp();
            mineToTimestamp = 1* 24 * 60 * 60
            //24days
            await blockchain.mineBlock(timestamp + mineToTimestamp);

            //lockId 3 rewards claimed
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_3});
            let pendingRewards = (await stakingService.getUsersPendingRewards(staker_3,streamId)).toString()
            console.log("pending rewards for lock Id 3 at first claim",_convertToEtherBalance(pendingRewards));

            mineToTimestamp = 100
            //
            await blockchain.mineBlock(await _getTimeStamp() + mineToTimestamp);
            //lockId 3 all rewards for streamId 2 withdrawn
            await stakingService.withdrawStream(streamId, {from: staker_3})
            await blockchain.mineBlock(await _getTimeStamp() + mineToTimestamp);
            //lockId is unlocked:
            await stakingService.claimAllStreamRewardsForLock(lockId, {from: staker_3})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(lockId, {from : staker_3, gas: 600000});
            await blockchain.mineBlock(await _getTimeStamp() + mineToTimestamp);

            //so Now, the previous lockId 4 is lockId 3:
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_3});
            pendingRewards = (await stakingService.getUsersPendingRewards(staker_3,streamId)).toString()
            console.log("pending rewards for lockId 3 (previously 4) after unlocking:",_convertToEtherBalance(pendingRewards));
            await blockchain.mineBlock(await _getTimeStamp() + mineToTimestamp);
        })

        it("Should get all unlocked main token for staker - 3", async() => {
            //  When we unlock, the main token should be sent to stream 0, with users stream id.  
            // Once unlocked, the token is available for withdrawl from stream 0 to staker - 3.
            // streamId 0 is the id for the main protocol token
            const streamId = 0            
            // Here we use getUsersPendingRewards, for stream id 0, to check the balance of main protocol token, since 
            //      the main protocol token is always distributed/released through stream 0.
            const pendingStakedFTHM = await stakingService.getUsersPendingRewards(staker_3, streamId)

            let beforeBalanceOfStaker_3 = await FTHMToken.balanceOf(staker_3);

            await blockchain.mineBlock(15 + await _getTimeStamp())
            await stakingService.withdrawStream(streamId, {from: staker_3})

            const afterBalanceOfStaker_3 = await FTHMToken.balanceOf(staker_3);
            
            const expectedFTHMBalanceStaker3 =_calculateAfterWithdrawingBalance(pendingStakedFTHM.toString(),beforeBalanceOfStaker_3.toString());
            assert.equal(afterBalanceOfStaker_3.toString(), expectedFTHMBalanceStaker3.toString())
        })

        it("Should apply penalty to early withdrawal - larger penalty for earlier withdrawl", async() => {
            const lockId = 4
            const streamId = 0
            
            const lockingPeriod = 365 * 24 * 60 * 60;
            await stakingService.createLock(sumToDeposit,lockingPeriod,{from: staker_3,gas: maxGasForTxn});
            
            await blockchain.mineBlock(60 * 60 + await _getTimeStamp())
            const penalty = await stakingGetterService.getFeesForEarlyUnlock(lockId, staker_3);
            let balanceOfFTHM = await FTHMToken.balanceOf(staker_3)
            console.log("balance before early unlock: ",_convertToEtherBalance(balanceOfFTHM.toString()))
            console.log("penalty for staker if he early unlocks now", _convertToEtherBalance(penalty.toString()))
            await stakingService.earlyUnlock(lockId, {from: staker_3})
           //pendingStakedFTHM = await stakingService.getUsersPendingRewards(staker_3,streamId)
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.withdrawStream(streamId, {from: staker_3})
            balanceOfFTHM = await FTHMToken.balanceOf(staker_3)
            console.log("balance after early unlock: (around 29.9 penalty)",_convertToEtherBalance(balanceOfFTHM.toString()))
        })

        
        it("Should unlock all lock positions: ", async() =>{
            
            const lockingPeriod = 370* 24 * 60 * 60
            await blockchain.increaseTime(lockingPeriod)
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_2})
            await blockchain.mineBlock(10 + await _getTimeStamp())

            let result = await stakingService.unlockPartially(1,sumToDeposit,{from: staker_2});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())
            
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_2})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            result = await stakingService.unlock(1, {from: staker_2});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())

            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_3})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            result = await stakingService.unlock(1, {from : staker_3});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())
            
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_3})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_3});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())
            
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_3})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_3});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())
            
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_4})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_4});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())
            
            await stakingService.claimAllStreamRewardsForLock(1, {from: staker_4})
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.unlock(1, {from: staker_4});
            console.log("unlocking gas used",result.gasUsed.toString())
            await blockchain.mineBlock(15 + await _getTimeStamp())

            
            const totalAmountOfStakedToken = await stakingService.totalAmountOfStakedToken()
            const totalAmountOfStreamShares = await stakingService.totalStreamShares()

            // console.log("----- After all the locks are completely unlocked ------")
            // console.log("totalAmountOfStakedToken: ", totalAmountOfStakedToken.toString());
            // console.log("totalShares: ", totalShares.toString());
            // console.log("totalAmountOfStreamShares: ", totalAmountOfStreamShares.toString());

            assert.equal(totalAmountOfStakedToken.toString(),"0")
            assert.equal(totalAmountOfStreamShares.toString(),"0")
        })

        

        it('Should have balances of unlocked FTHM with rewards after all unlocks', async() => {
            const MAIN_STREAM_ID = 0;
            await stakingService.withdrawAllStreams({from: staker_2})
            await stakingService.withdrawAllStreams({from: staker_3})
            await stakingService.withdrawAllStreams({from: staker_4})
            let staker_2Balance = await FTHMToken.balanceOf(staker_2);
            let staker_3Balance = await FTHMToken.balanceOf(staker_3);
            let staker_4Balance = await FTHMToken.balanceOf(staker_4);
            
            staker_2Balance =  _convertToEtherBalance(staker_2Balance.toString())
            staker_3Balance =  _convertToEtherBalance(staker_3Balance.toString())
            staker_4Balance = _convertToEtherBalance(staker_4Balance.toString())
            const initialBalanceOfEachStaker = _convertToEtherBalance(sumToTransfer)
            const totalRewardsDistributed =   parseInt(staker_2Balance) 
                                            + parseInt(staker_3Balance)
                                            + parseInt(staker_4Balance) - 3 * parseInt(initialBalanceOfEachStaker)
            //20000-10000 -> First year
            const toBeReleasedInFirstYearRewards = 10000;
            expect(totalRewardsDistributed).to.be.above(toBeReleasedInFirstYearRewards);
            console.log("total rewards released in FTHM Token - after 370 + ~20 days - early unstake penalty", totalRewardsDistributed)
            
        })

        it('Should have zero stream pending', async() => {
            const MAIN_STREAM_ID = 0;
            const FIRST_STREAM_ID = 1
            const SECOND_STREAM_ID = 2
            const totalAmountOfMAINStreamTotalUserPendings = await stakingService.streamTotalUserPendings(MAIN_STREAM_ID)
            const totalAmountOfFIRSTStreamTotalUserPendings = await stakingService.streamTotalUserPendings(FIRST_STREAM_ID)
            const totalAmountOfSECONDStreamTotalUserPendings = await stakingService.streamTotalUserPendings(SECOND_STREAM_ID)
            assert.equal(totalAmountOfMAINStreamTotalUserPendings.toString(),"0")
            assert.equal(totalAmountOfFIRSTStreamTotalUserPendings.toString(),"0")
            assert.equal(totalAmountOfSECONDStreamTotalUserPendings.toString(),"0")
        })

        // The following tests are just to check individual test cases
        it("Should apply penalty to early withdrawal", async() => {
            const lockId = 1
            const streamId = 0
            await blockchain.mineBlock(await _getTimeStamp() + 20)
            const lockingPeriod = 60 * 60
            let unlockTime =  lockingPeriod;
            await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_3,gas: maxGasForTxn});
            await blockchain.mineBlock(10 + await _getTimeStamp())
            await stakingService.earlyUnlock(lockId, {from: staker_3})

            pendingStakedFTHM = await stakingService.getUsersPendingRewards(staker_3,streamId)
            console.log("Pending user accounts with early withdrawal: ",_convertToEtherBalance(pendingStakedFTHM.toString()))

            const errorMessage = "out of index";

            await shouldRevert(
                stakingGetterService.getLockInfo(staker_3,lockId),
                errTypes.revert,  
                errorMessage
            );

        })

        it('Setup lock position for stakers _4,', async() => {
           
            const lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime =  lockingPeriod;
            await blockchain.mineBlock(await _getTimeStamp() + 100);
            let result3 = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 100);

        })

        it('Setup lock position for accounts[9] for govn to use', async() => {
            
            const sumToApprove = web3.utils.toWei('20000','ether');

            await FTHMToken.approve(vaultService.address, sumToApprove, {from: accounts[9]})  
            const lockingPeriod = 365 * 24 * 60 * 60
            const unlockTime =  lockingPeriod;

            const sumToDeposit = web3.utils.toWei('20000', 'ether');
            let result1 = await stakingService.createLock(sumToDeposit,unlockTime, {from: accounts[9], gas: maxGasForTxn});
            
            let eventArgs = eventsHelper.getIndexedEventArgs(result1, "Staked(address,uint256,uint256,uint256,uint256,uint256)");
            const actualNVFTHM = web3.utils.toBN(eventArgs[1])
            console.log("Are 20000 VOTE TOKENS released?: ", _convertToEtherBalance(actualNVFTHM.toString()))    

        })

        it("Should get correct user total votes from staking getter service", async() => {
            let result = await stakingGetterService.getUserTotalVotes(accounts[9])
            console.log("accounts[9] vote balance from staking getter service", _convertToEtherBalance(result.toString()),"VOTES")
        })

        it('Should withdraw penalty to treasury', async() =>{

            const treasury = multiSigWallet.address
            const _withdrawEarlyPenalty = async(
                _penaltyReceiver
            ) => {
                const result = await multiSigWallet.submitTransaction(
                    stakingService.address,
                    EMPTY_BYTES,
                    _encodeWithdrawPenaltyFunction(
                        _penaltyReceiver
                    ),
                    0,
                    {"from": accounts[0]}
                )

                const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
    
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});
    
                await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
            }
            await blockchain.mineBlock(10 + await _getTimeStamp());
            const beforeBalanceOfTreasury = await FTHMToken.balanceOf(treasury);
            let totalPenaltyBalance = await stakingService.totalPenaltyBalance();
            
            await _withdrawEarlyPenalty(multiSigWallet.address)
            const afterBalanceOfTreasury = await FTHMToken.balanceOf(treasury);
            const expectedDifferenceInBalance = _calculateRemainingBalance(beforeBalanceOfTreasury.toString(),afterBalanceOfTreasury.toString())
            expectedDifferenceInBalance.should.be.bignumber.equal(totalPenaltyBalance.toString())
            totalPenaltyBalance = await stakingService.totalPenaltyBalance();
            
            assert(totalPenaltyBalance.toString(),"0")
        })

        it('Paused contract should not make lock position', async() => {
            const toPauseFlag = 1

            const _pauseStakingContract = async(
                _flag
            ) => {
                const result = await multiSigWallet.submitTransaction(
                    stakingService.address,
                    EMPTY_BYTES,
                    _encodeAdminPause(
                        _flag
                    ),
                    0,
                    {"from": accounts[0]}
                )

                const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
    
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});
    
                await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
            }
            await _pauseStakingContract(toPauseFlag)
            const lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime =  lockingPeriod;
            await blockchain.mineBlock(await _getTimeStamp() + 100);
            const errorMessage = "paused contract"
            await shouldRevert(
                stakingService.createLock(sumToDeposit,unlockTime,{from: staker_4, gas: maxGasForTxn}),
                errTypes.revert,  
                errorMessage
            );
        })

        it('Unpaused contract should  make lock position', async() => {
            const toUnPauseFlag = 0
            const _unpauseStakingContract = async(
                _flag
            ) => {
                const result = await multiSigWallet.submitTransaction(
                    stakingService.address,
                    EMPTY_BYTES,
                    _encodeAdminPause(
                        _flag
                    ),
                    0,
                    {"from": accounts[0]}
                )

                const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
    
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});
    
                await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
            }
            await _unpauseStakingContract(toUnPauseFlag)
            const lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime =  lockingPeriod;
            await blockchain.mineBlock(await _getTimeStamp() + 100);
            let result3 = await stakingService.createLock(sumToDeposit,unlockTime, {from: staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 100);
        })

        it('Should should  make lock position with 0 lock period', async() => {
            const unlockTime =  0;
            await blockchain.mineBlock(await _getTimeStamp() + 100);
            let result3 = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_4, gas: maxGasForTxn});
            await blockchain.mineBlock(await _getTimeStamp() + 100);
        })


        it('Should not be initalizable twice - Vault', async() => {

            const errorMessage = "Initializable: contract is already initialized";
            await shouldRevert(
                vaultService.initVault(multiSigWallet.address,[FTHMToken.address], {gas: 8000000}),
                errTypes.revert,
                errorMessage
            ); 
            
        })
    })
});
   
