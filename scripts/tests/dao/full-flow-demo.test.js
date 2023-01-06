/*
1.  Flow for staking for two users
2   One of the stakers creates a proposal.
3.  Some time passes
4.  Check their staked balances or reward balances
4.1 One of the stakers makes a second staking possition
5.  Allow them to vote on a proposal
6.  Some time passes
7.  Successful proposal gets executed through time lock

TO INCLUDE:

1:7. Show the different voting power represented by vote token balance or weight calculation in governor.
    Illustrate how different locking periods result in different voting power.

    Should show the penalty process, from the stakers perspective and the treasury perspective



    STAKING:
    - Two stakers
    - Create stream
    - One main token, One reward token
    - One early unlock
    - Two lock possitions
    - One demo of penalty
    - One unlock after time period

    For whole dao, console log through out

    GOVERNOR:
    - Create one proposal to change a value in a BOX contract
    - 
*/

const blockchain = require("../helpers/blockchain");
const eventsHelper = require("../helpers/eventsHelper");
const { assert } = require("chai");
const {
    shouldRevert,
    errTypes
} = require('../helpers/expectThrow');

const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';


// Proposal 1
const PROPOSAL_DESCRIPTION = "Proposal #1: Store 1 in the Box contract";
const NEW_STORE_VALUE = "142";

// / proposal 2
const PROPOSAL_DESCRIPTION_2 = "Proposal #2: Distribute funds from treasury to accounts[5]";

// Events
const PROPOSAL_CREATED_EVENT = "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)"
const SUBMIT_TRANSACTION_EVENT = "SubmitTransaction(uint256,address,address,uint256,bytes)";


const SYSTEM_ACC = accounts[0];
const staker_1 = accounts[6];
const staker_2 = accounts[3];
const staker_9 = accounts[9];

const comity_1 = accounts[0];
const comity_2 = accounts[1];

const stream_rewarder_1 = accounts[5];

let vault_test_address;
let treasury;

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


const maxGasForTxn = 600000

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

const _createLockParamObject = (
    _amount,
    _lockPeriod,
    _account) => {
    return {
        amount: _amount,
        lockPeriod: _lockPeriod,
        account: _account
    }
}

const _calculateRemainingBalance = (depositAmount, beforeBalance) => {
    const depositAmountBN = new web3.utils.BN(depositAmount);
    const beforeBalanceBN = new web3.utils.BN(beforeBalance)
    return beforeBalanceBN.sub(depositAmountBN)
}

const _convertToEtherBalance = (balance) => {
    return parseFloat(web3.utils.fromWei(balance,"ether").toString()).toFixed(5)
}

const _encodeConfirmation = async (_proposalId) => {
    return web3.eth.abi.encodeFunctionCall({
            name: 'confirmProposal',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: '_proposalId'
            }]
        }, [_proposalId.toString()]);
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

const _encodeStakeFunction = (_createLockParam) => {
    // encoded transfer function call for staking on behalf of someone else from treasury.
    let toRet = web3.eth.abi.encodeFunctionCall({
        name:'createLocksForCouncils',
        type:'function',
        inputs: [{
                type: 'tuple[]',
                name: 'CreateLockParams',
                components: [
                    {"type":"uint256", "name":"amount"},
                    {"type":"uint256", "name":"lockPeriod"},
                    {"type":"address", "name":"account"}
                ]
            }
        ]
    },[_createLockParam])
    return toRet
}

const _encodeStakeApproveFunction = (amount, spender) => {
    // approve(address spender, uint256 amount)
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'approve',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'spender'
        },{
            type: 'uint256',
            name: 'amount'
        }]
    }, [spender, amount]);

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

const _encodeRevokeFunction = (
    _role,
    _account
) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'revokeRole',
        type: 'function',
        inputs: [{
            type: 'bytes32',
            name: 'role'
        },{
            type: 'address',
            name: 'account'
        }]
    }, [
        _role,
        _account
    ]);

    return toRet;
}

describe("DAO Demo", () => {
    const oneYear = 31556926;
    let stakingService;
    let stakingGetterService;
    let vaultService;
    let FTHMToken;
    let vMainToken;

    let streamReward1;
    let FTHMTokenAddress;
    let streamReward1Address;

    let lockingVoteWeight;
    let proxyAddress;

    let encodedConfirmation1;
    let encodedConfirmation2;
    let txIndex1;
    let txIndex2;
    let txIndex3;
    let txIndex4;
    let txIndex5;
    let txIndex6;

    let timelockController
    let mainTokenGovernor
    let box
    let mainToken
    let multiSigWallet
    
    let proposer_role
    let executor_role
    let timelock_admin_role

    let proposalId
    let proposalId2
    let result
    let encoded_function
    let encoded_treasury_function
    let description_hash
    let description_hash_2

    let afterBalanceOfTreasury

    let txIndex

    const sumToDeposit = web3.utils.toWei('1000', 'ether');
    const sumToTransfer = web3.utils.toWei('4000', 'ether');
    const sumToApprove = web3.utils.toWei('5000','ether');

    before(async() => {
        timelockController = await artifacts.initializeInterfaceAt("TimelockController", "TimelockController");
        vMainToken = await artifacts.initializeInterfaceAt("VMainToken", "VMainToken");
        mainTokenGovernor = await artifacts.initializeInterfaceAt("MainTokenGovernor", "MainTokenGovernor");
        box = await artifacts.initializeInterfaceAt("Box", "Box");
        mainToken = await artifacts.initializeInterfaceAt("MainToken", "MainToken");

        multiSigWallet = await artifacts.initializeInterfaceAt("MultiSigWallet", "MultiSigWallet");
        treasury = multiSigWallet.address;
        
        proposer_role = await timelockController.PROPOSER_ROLE();
        executor_role = await timelockController.EXECUTOR_ROLE();
        timelock_admin_role = await timelockController.TIMELOCK_ADMIN_ROLE();

        await snapshot.revertToSnapshot();
        
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
        await streamReward1.transfer(stream_rewarder_1,web3.utils.toWei("10000","ether"),{from: SYSTEM_ACC});

        vMainToken = await artifacts.initializeInterfaceAt("VMainToken", "VMainToken");
        
        vMainTokenAddress = vMainToken.address;
        FTHMTokenAddress = FTHMToken.address;
        streamReward1Address = streamReward1.address;

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
        vault_test_address = vaultService.address;

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
        // encode the function call to change the value in box.  To be performed if the vote passes
        encoded_function = web3.eth.abi.encodeFunctionCall({
            name: 'store',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: 'value'
            }]
        }, [NEW_STORE_VALUE]);

        description_hash = web3.utils.keccak256(PROPOSAL_DESCRIPTION);
        description_hash_2 = web3.utils.keccak256(PROPOSAL_DESCRIPTION_2);
    })

    

    describe('Create two lock positions, release governance tokens, stream rewards', async() => {
        let expectedTotalAmountOfVFTHM = new web3.utils.BN(0)

        it('Should create a lock possition with lockId = 1 for staker_1', async() => {
            await FTHMToken.approve(vaultService.address, sumToApprove, {from: staker_1})
            
            await blockchain.increaseTime(20);
            let lockingPeriod = 365 * 24 * 60 * 60;
            const unlockTime = lockingPeriod;
            const beforeLockTimestamp = await _getTimeStamp()
            let result = await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_1});
            lockingPeriod = lockingPeriod - (await _getTimeStamp() - beforeLockTimestamp);
            console.log(".........Total Staked Protocol Token Amount for Lock Position for a year", _convertToEtherBalance(sumToDeposit));
            const expectedNVFTHM = _calculateNumberOfVFTHM(sumToDeposit, lockingPeriod, lockingVoteWeight)
            expectedTotalAmountOfVFTHM = expectedTotalAmountOfVFTHM.add(expectedNVFTHM)

            const staker1VeTokenBal = (await vMainToken.balanceOf(staker_1)).toString()
            console.log(".........Released VOTE tokens to staker 1 based upon locking period (1 year) and locking amount  (1000 Protocol Tokens) ",_convertToEtherBalance(staker1VeTokenBal), 'VOTE Tokens')
        });

        it('Should create a lock possition with lockId = 2 for staker_1', async() => {
            await blockchain.increaseTime(20);
            let lockingPeriod = 365 * 24 * 60 * 60/2;
            const unlockTime = lockingPeriod;
            const beforeLockTimestamp = await _getTimeStamp()
            let result = await stakingService.createLock(sumToDeposit,unlockTime, {from: staker_1});
            console.log(".........Total Staked Protocol Token Amount for Lock Position for 1/2 a year", _convertToEtherBalance(sumToDeposit));
            lockingPeriod = lockingPeriod - (await _getTimeStamp() - beforeLockTimestamp);
            const expectedNVFTHM = _calculateNumberOfVFTHM(sumToDeposit, lockingPeriod, lockingVoteWeight)
            expectedTotalAmountOfVFTHM = expectedTotalAmountOfVFTHM.add(expectedNVFTHM)

            const staker1VeTokenBal = (await vMainToken.balanceOf(staker_1)).toString()
            console.log(".........Released VOTE tokens to staker 1 based upon locking period (1 / 2 year) and locking amount  (1000 Protocol Tokens) ",_convertToEtherBalance(staker1VeTokenBal), 'VOTE Tokens')
        });

        
        it("Should update total vote token balance.", async() => {
            console.log(".........Released VOTE tokens to staker 1 based upon two lock positions.",_convertToEtherBalance(expectedTotalAmountOfVFTHM), 'VOTE Tokens')
        })

        it('Should create 2 lock positions with lockId = 1 and lockId = 2 for staker_2', async() => {
            await FTHMToken.approve(vaultService.address, sumToApprove, {from: staker_2});
            
            await blockchain.increaseTime(20);
            let lockingPeriod = 365 * 24 * 60 * 60;

            const unlockTime = lockingPeriod;
            await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_2});
            await blockchain.increaseTime(20);
            let result = await stakingService.createLock(sumToDeposit,unlockTime, {from: staker_2});
        });

        it("Should propose the first staking stream, stream - 1", async() => {

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

            await blockchain.mineBlock(await _getTimeStamp() + 10);
        });

        it("Should Create a stream, stream - 1", async() => {
            const streamId = 1
            const RewardProposalAmountForAStream = web3.utils.toWei('1000', 'ether');
            await streamReward1.approve(vaultService.address, RewardProposalAmountForAStream, {from:stream_rewarder_1});
            await stakingService.createStream(streamId,RewardProposalAmountForAStream, {from: stream_rewarder_1});
        });

        it('Should get correct Rewards', async() => {
            const streamId = 1
            await blockchain.increaseTime(20);
            let lockingPeriod = 20 * 24 * 60 * 60
            const unlockTime = lockingPeriod;
            
            let beforeLockTimestamp = await _getTimeStamp();
            await stakingService.createLock(sumToDeposit,unlockTime,{from: staker_2,gas: maxGasForTxn});

            lockingPeriod = lockingPeriod - (await _getTimeStamp() - beforeLockTimestamp)
            const mineToTimestamp = 20 * 24 * 60 * 60
            await blockchain.mineBlock(beforeLockTimestamp + mineToTimestamp);
            
            
            const lockId = 1
            const rewardsPeriod = lockingPeriod
            const rewardsPeriodBN = new web3.utils.toBN(rewardsPeriod)
            const RewardProposalAmountForAStream = web3.utils.toWei('1000', 'ether');
            
            await stakingService.claimAllStreamRewardsForLock(lockId,{from:staker_2, gas: maxGasForTxn});
            
            //Getting params from contracts to calculate the expected rewards:
            
            //"rewards are based upon how much shares you have on total pool and the actual rewards schedule of the stream"
            //"Here, rewards = (amount of time passed since stream started) / (total time of stream) * (stream shares of the staker)"

            // Minute changes in blocktimes effect the rewards calculations.  
            //  So in reward tests like this one we just check that the expected value is within an acceptable range of the output.
        })

    });

    describe('Governance', async() => {
        it('Consider a contract owned by the governor called: Box', async() => {

            // Store a value
            await box.store(5);

            // Test if the returned value is the same one
            expect((await box.retrieve()).toString()).to.equal('5');
            console.log(".........The initial value stored in the box contract is: .........");
            console.log((await box.retrieve()).toString());


        });

        it('Transfer ownership of the box to TimelockController', async() => {

            await box.transferOwnership(timelockController.address);
            
            const new_owner = await box.owner();
            assert.equal(new_owner, timelockController.address);
        });

        it('Propose a change to the box\'s store value to: 142', async() => {

            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [box.address],
                [0],
                [encoded_function],
                PROPOSAL_DESCRIPTION,
                {"from": staker_1}
            );
            // retrieve the proposal id
            proposalId = eventsHelper.getIndexedEventArgs(result, PROPOSAL_CREATED_EVENT)[0]; 
            
            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;    
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Check that the proposal is open for voting
            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("1");
        });


        it('Vote on the proposal', async() => {

            // enum VoteType {
            //     Against,
            //     For,
            //     Abstain
            // }
            // =>  0 = Against, 1 = For, 2 = Abstain 

            let currentNumber = await web3.eth.getBlockNumber();
            let block = await web3.eth.getBlock(currentNumber);
            let timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);   
                nextBlock++;              
            }
            // Vote:
            await mainTokenGovernor.castVote(proposalId, "1", {"from": staker_1});

            currentNumber = await web3.eth.getBlockNumber();
            block = await web3.eth.getBlock(currentNumber);
            timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock);
                nextBlock++;              
            }

            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("4");
        });

        it('Queue the proposal', async() => {

            // Functions mainTokenGovernor.propose and mainTokenGovernor.queue have the same input, except for the
            //      description parameter, which we need to hash.
            //
            // A proposal can only be executed if the proposalId is the same as the one stored 
            //      in the governer contract that has passed a vote.
            // In the Governor.sol contract, the proposalId is created using all information used 
            //      in to create the proposal:
            // uint256 proposalId = hashProposal(targets, values, calldatas, keccak256(bytes(description)));

            const result = await mainTokenGovernor.queue(      
                [box.address],
                [0],
                [encoded_function],
                description_hash,
                {"from": accounts[0]}
            );            
        });


        it('Create multiSig transaction to confirm proposal 1', async() => {
            encodedConfirmation1 = _encodeConfirmation(proposalId);

            const result = await multiSigWallet.submitTransaction(
                mainTokenGovernor.address, 
                EMPTY_BYTES, 
                encodedConfirmation1,
                0,
                {"from": accounts[0]}
            );
            txIndex1 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        })

        it('Should confirm transaction 1 from accounts[0], the first signer and accounts[1], the second signer', async() => {
            await multiSigWallet.confirmTransaction(txIndex1, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex1, {"from": accounts[1]});
        });

        
        it('Execute the multiSig confirmation of proposal 1 and wait 40 blocks', async() => {
            await multiSigWallet.executeTransaction(txIndex1, {"from": accounts[0]});

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock); 
                nextBlock++;              
            }
            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("5");
        });



        it('Execute the proposal', async() => {

            const result = await mainTokenGovernor.execute(      
                [box.address],
                [0],
                [encoded_function],
                description_hash,
                {"from": accounts[0]}
            );
        });

        it('Check that the proposal status is: succesful', async() => {
            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("7");
        });

        it('Should retrieve the updated value proposed by governance for the new store value in box.sol', async() => {

            const new_val = await box.retrieve();

            // Test if the returned value is the new value
            expect((await box.retrieve()).toString()).to.equal(NEW_STORE_VALUE);

            console.log(".........The new updated value stored in the box contract is:.........");
            console.log((await box.retrieve()).toString());
        });
    });

    describe('Unlock The whole lock position for staker 2, EarlyUnlock() implies that there should be some Penalty ', async() => {
        it("Should early unlock first lock position of staker _2, with penalty", async() => {
            const lockId = 1
            const streamId = 0 // Main Token Stream
            await stakingService.earlyUnlock(lockId, {from: staker_2});

            pendingStakedFTHM = await stakingService.getUsersPendingRewards(staker_2,streamId)
            console.log(".........Pending user Balance with early withdrawal: (around 72% due to  early unlock punishment)",_convertToEtherBalance(pendingStakedFTHM.toString()))
        });

        it('The protocol can now withdraw penalty accrued to the treasury', async() =>{
            await blockchain.mineBlock(10 + await _getTimeStamp());
            const beforeBalanceOfTreasury = await FTHMToken.balanceOf(treasury);
            console.log(".........The balance of treasury before withdrawing the penalty due to early withdrawal",_convertToEtherBalance(beforeBalanceOfTreasury.toString()))
            let beforeTotalPenaltyBalance = await stakingService.totalPenaltyBalance();

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
            await _withdrawEarlyPenalty(multiSigWallet.address)
            
            afterBalanceOfTreasury = await FTHMToken.balanceOf(treasury);
            console.log(".........The balance of treasury after withdrawing the penalty due to early withdrawal",_convertToEtherBalance(afterBalanceOfTreasury.toString()))
            const expectedDifferenceInBalance = _calculateRemainingBalance(beforeBalanceOfTreasury.toString(),afterBalanceOfTreasury.toString())
            expectedDifferenceInBalance.should.be.bignumber.equal(beforeTotalPenaltyBalance.toString())
            const currentTotalPenaltyBalance = await stakingService.totalPenaltyBalance();
            
            assert(currentTotalPenaltyBalance.toString(),"0")
        })
    })


    describe("VC Treasury Distribution Through Governor", async() => {

        it('Prepare encoded funciton calls', async() =>{

            encoded_transfer_function = web3.eth.abi.encodeFunctionCall({
                name: 'transfer',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: 'to'
                },{
                    type: 'uint256',
                    name: 'amount'
                }]
            }, [staker_9, "1000000"]);

            

            // encode the function call to release funds from MultiSig treasury.  To be performed if the vote passes
            encoded_treasury_function = web3.eth.abi.encodeFunctionCall({
                name: 'submitTransaction',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_to'
                },{
                    type: 'uint256',
                    name: '_value'
                },{
                    type: 'bytes',
                    name: '_data'
                },{
                    type: 'uint256',
                    name: '_expireTimestamp'
                }]
            }, [FTHMTokenAddress, EMPTY_BYTES, encoded_transfer_function, 0]);
        });

        

        it('Create proposal to send VC funds from MultiSig treasury to account 5', async() => {
            const eightHours = 28800
            await blockchain.mineBlock(await _getTimeStamp() + eightHours);    
            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [multiSigWallet.address],
                [0],
                [encoded_treasury_function],
                PROPOSAL_DESCRIPTION_2,
                {"from": staker_1}
            );

            // retrieve the proposal id
            proposalId2 = eventsHelper.getIndexedEventArgs(result, PROPOSAL_CREATED_EVENT)[0];
   
        });


        it('Vote on the second proposal', async() => {

            // enum VoteType {
            //     Against,
            //     For,
            //     Abstain
            // }
            // =>  0 = Against, 1 = For, 2 = Abstain 

            let currentNumber = await web3.eth.getBlockNumber();
            let block = await web3.eth.getBlock(currentNumber);
            let timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Vote:
            await mainTokenGovernor.castVote(proposalId2, "1", {"from": staker_1});

            currentNumber = await web3.eth.getBlockNumber();
            block = await web3.eth.getBlock(currentNumber);
            timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock);
                nextBlock++;              
            }
            // Check that the proposal is succesful:
            expect((await mainTokenGovernor.state(proposalId2)).toString()).to.equal("4"); 

        });


        it('Queue the second proposal', async() => {
            await mainTokenGovernor.queue(      
                [multiSigWallet.address],
                [0],
                [encoded_treasury_function],
                description_hash_2,
                {"from": accounts[0]}
            );
        });

        it('Create multiSig transaction to confirm proposal 1', async() => {
            encodedConfirmation2 = _encodeConfirmation(proposalId2);

            const result = await multiSigWallet.submitTransaction(
                mainTokenGovernor.address, 
                EMPTY_BYTES, 
                encodedConfirmation2,
                0,
                {"from": accounts[0]}
            );
            txIndex2 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        })

        it('Should confirm transaction 1 from accounts[0], the first signer and accounts[1], the second signer', async() => {
            await multiSigWallet.confirmTransaction(txIndex2, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex2, {"from": accounts[1]});
        });

        
        it('Execute the multiSig confirmation of proposal 1 and wait 40 blocks', async() => {
            await multiSigWallet.executeTransaction(txIndex2, {"from": accounts[0]});

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock); 
                nextBlock++;              
            }
            expect((await mainTokenGovernor.state(proposalId2)).toString()).to.equal("5");
        });


        it('Execute the second proposal', async() => {
            result = await mainTokenGovernor.execute(      
                [multiSigWallet.address],
                [0],
                [encoded_treasury_function],
                description_hash_2,
                {"from": accounts[0]}
            );
            txIndex = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];

            // Check that the proposal status is: Executed
            expect((await mainTokenGovernor.state(proposalId2)).toString()).to.equal("7");

        });

        it('MultiSig confirm and Execute the release of funds from MultiSig treasury', async() => {
            // Here the acocunts which have been designated a "Signer" role for the governor 
            //      need to confirm each transaction before it can be executed.
            await multiSigWallet.confirmTransaction(txIndex, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex, {"from": accounts[1]});
            // Execute:
            await multiSigWallet.executeTransaction(txIndex, {"from": accounts[0]});
            // Balance of account 5 should reflect the funds distributed from treasury in proposal 2
            // expect((await mainToken.balanceOf(staker_1, {"from": staker_1})).toString()).to.equal(AMOUNT_OUT_TREASURY);
            const staker_9Balance = await FTHMToken.balanceOf(staker_9);
            console.log(".........The balance of the recipient after release of treasury funds is",_convertToEtherBalance(staker_9Balance.toString()))

        });        
    });


    describe('Create lock possitions from treasury on behalf of comity ', async() => {

        it('Create multiSig transactions to stake on behalf of comity', async() => {

            const oneYr = 365 * 24 * 60 * 60;
            const amount = web3.utils.toWei('200000', 'ether');
            const approveAmount = web3.utils.toWei('400001', 'ether');

            result = await multiSigWallet.submitTransaction(
                FTHMToken.address,
                EMPTY_BYTES, 
                _encodeStakeApproveFunction(approveAmount, vaultService.address),
                0,
                {"from": accounts[0]}
            );
            txIndex3 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
            const LockParamObjectForAllCouncils = [
                _createLockParamObject(amount,oneYr,comity_1),
                _createLockParamObject(amount,oneYr,comity_2)
            ]
            
            let result2 = await multiSigWallet.submitTransaction(
                stakingService.address,
                EMPTY_BYTES, 
                _encodeStakeFunction(LockParamObjectForAllCouncils),
                0,
                {"from": accounts[0]}
            );
            txIndex5 = eventsHelper.getIndexedEventArgs(result2, SUBMIT_TRANSACTION_EVENT)[0];
        })

        it('Confirm and execute multiSig transactions to stake on behalf of comity', async() => {
            // Confirm
            await multiSigWallet.confirmTransaction(txIndex3, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex3, {"from": accounts[1]});

            await multiSigWallet.confirmTransaction(txIndex5, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex5, {"from": accounts[1]});

            // execute:
            await multiSigWallet.executeTransaction(txIndex3, {"from": accounts[0]});
            await blockchain.increaseTime(20);
            await multiSigWallet.executeTransaction(txIndex5, {"from": accounts[0]});
            await blockchain.increaseTime(20);
        });

        it("Check that the lock possitions have been made on behalf of the comity", async() => {

            const amount = web3.utils.toWei('200000', 'ether');
            
            result = await stakingGetterService.getLockInfo(comity_1,1);
            const comity_1StakedFTHM = result.amountOfToken.toString();

            result = await stakingGetterService.getLockInfo(comity_2,1);
            const comity_2StakedFTHM = result.amountOfToken.toString();

            assert.equal(comity_1StakedFTHM, amount.toString());
            assert.equal(comity_2StakedFTHM, amount.toString());
        });       
        
        
        it("Should Revert: early unlock not possible", async() => {
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            const errorMessage = "early infeasible";

             await shouldRevert(
                stakingService.earlyUnlock(1, {from: comity_1}),
                errTypes.revert, 
                errorMessage
            );
        })
        
        it("Wait one year and unlock more than was staked, because of staking rewards", async() => {

            const oneYr = 365 * 24 * 60 * 60;
            const threeSec = 3 * 60;
            
            const amount2 = 200000*10**18;

            await blockchain.mineBlock(await _getTimeStamp() + oneYr);
            await stakingService.claimAllStreamRewardsForLock(1, {from: comity_1})
            await blockchain.mineBlock(await _getTimeStamp() + threeSec);
            await stakingService.unlock(1, {from: comity_1});
            await blockchain.mineBlock(await _getTimeStamp() + threeSec);
            
            await stakingService.withdrawStream(0, {from: comity_1});
            expect(parseInt(await FTHMToken.balanceOf(comity_1))).to.be.above(amount2);

            await blockchain.mineBlock(await _getTimeStamp() + oneYr);
            await stakingService.claimAllStreamRewardsForLock(1, {from: comity_2})
            await blockchain.mineBlock(await _getTimeStamp() + threeSec);
            await stakingService.unlock(1, {from: comity_2});
            await blockchain.mineBlock(await _getTimeStamp() + threeSec);
            await stakingService.withdrawStream(0, {from: comity_2});
            expect(parseInt(await FTHMToken.balanceOf(comity_2))).to.be.above(amount2);

        })
        it('Should revoke Proposer Role - check', async() => {
            await blockchain.mineBlock(await _getTimeStamp() + 20);
            const _revoke = async (
                _role,
                _account
            ) => {
                const result = await multiSigWallet.submitTransaction(
                    timelockController.address, 
                    EMPTY_BYTES, 
                    _encodeRevokeFunction(
                        _role,
                        _account
                    ),
                    0,
                    {"from": accounts[0]}
                );
                const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
    
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[0]});
                await multiSigWallet.confirmTransaction(tx, {"from": accounts[1]});
    
                await multiSigWallet.executeTransaction(tx, {"from": accounts[1]});
            }
            await _revoke(
                proposer_role,
                mainTokenGovernor.address
            )
            
        })
    })
})
