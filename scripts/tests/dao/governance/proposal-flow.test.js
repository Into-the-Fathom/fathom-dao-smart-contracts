const blockchain = require("../../helpers/blockchain");
const eventsHelper = require("../../helpers/eventsHelper");
const { assert } = require("chai");
const {
    shouldRevert,
    errTypes
} = require('../../helpers/expectThrow');

const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';

// Proposal 1
const PROPOSAL_DESCRIPTION = "Proposal #1: Store 1 in the Box contract";
const NEW_STORE_VALUE = "5";

// / proposal 2
const PROPOSAL_DESCRIPTION_2 = "Proposal #2: Distribute funds from treasury to accounts[5]";
const AMOUNT_OUT_TREASURY = "1000";

// Events
const PROPOSAL_CREATED_EVENT = "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)"
const SUBMIT_TRANSACTION_EVENT = "SubmitTransaction(uint256,address,address,uint256,bytes)";

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

const T_TO_STAKE = web3.utils.toWei('2000', 'ether');
const STAKED_MIN = web3.utils.toWei('1900', 'ether');
let streamReward1;
let proposalIdForAddingSupportedToken;
let proposalIdForRelayFunction
const STAKER_1 = accounts[5];
const STAKER_2 = accounts[6];
const NOT_STAKER = accounts[7];

const _encodeTransferFunction = (_account) => {
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
    }, [_account, T_TO_STAKE]);

    return toRet;
}

const _getTimeStamp = async () => {
    const timestamp = await blockchain.getLatestBlockTimestamp()
    return timestamp
}

describe('Proposal flow', () => {

    let timelockController
    let vMainToken
    let mainTokenGovernor
    let box
    let FTHMToken
    let multiSigWallet
    let proxyAddress;

    let proposalId
    let proposalId2
    let result
    let encoded_function
    let encoded_transfer_function
    let encoded_treasury_function
    let encoded_relay_function
    let description_hash
    let description_hash_2

    let txIndex
    let txIndex1
    let txIndex2

    let lockingPeriod;
    let encoded_function_add_supporting_token;
    let encoded_function_relay;
    
    before(async () => {
        
        await snapshot.revertToSnapshot();
        timelockController = await artifacts.initializeInterfaceAt("TimelockController", "TimelockController");
        vMainToken = await artifacts.initializeInterfaceAt("VMainToken", "VMainToken");
        mainTokenGovernor = await artifacts.initializeInterfaceAt("MainTokenGovernor", "MainTokenGovernor");
        box = await artifacts.initializeInterfaceAt("Box", "Box");
        FTHMToken = await artifacts.initializeInterfaceAt("MainToken", "MainToken");
        multiSigWallet = await artifacts.initializeInterfaceAt("MultiSigWallet", "MultiSigWallet");
        streamReward1 = await artifacts.initializeInterfaceAt("ERC20Rewards2","ERC20Rewards2");
        stakingService = await artifacts.initializeInterfaceAt(
            "IStaking",
            "StakingProxy"
        )

        vaultService = await artifacts.initializeInterfaceAt(
            "IVault",
            "VaultProxy"
        )

        rewardsCalculator = await artifacts.initializeInterfaceAt(
            "RewardsCalculator",
            "RewardsCalculator"
        )
        
        FTHMToken = await artifacts.initializeInterfaceAt("MainToken","MainToken");

        lockingPeriod =  365 * 24 * 60 * 60;

        vMainTokenAddress = vMainToken.address;
        FTHMTokenAddress = FTHMToken.address;

        vault_test_address = vaultService.address;

        // encode the function call to change the value in box.  To be performed if the vote passes
        encoded_function = web3.eth.abi.encodeFunctionCall({
            name: 'store',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: 'value'
            }]
        }, [NEW_STORE_VALUE]);

        // encoded transfer function call for the main token.
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
        }, [STAKER_1, AMOUNT_OUT_TREASURY]);

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
        }, [FTHMToken.address, EMPTY_BYTES, encoded_transfer_function, 0]);

        description_hash = web3.utils.keccak256(PROPOSAL_DESCRIPTION);
        description_hash_2 = web3.utils.keccak256(PROPOSAL_DESCRIPTION_2);

    });

    describe("Box contract", async() => {

        it('Retrieve returns a value previously stored', async() => {
            // Store a value
            await box.store(42);

            // Test if the returned value is the same one
            expect((await box.retrieve()).toString()).to.equal('42');
        });

        it('Transfer ownership of the box to TimelockController', async() => {
            await box.transferOwnership(timelockController.address);
            
            const new_owner = await box.owner();
            assert.equal(new_owner, timelockController.address);
        });

    });

    describe("Staking MainToken to receive vMainToken token", async() => {
        const _transferFromMultiSigTreasury = async (_account) => {
            const result = await multiSigWallet.submitTransaction(
                FTHMToken.address, 
                EMPTY_BYTES, 
                _encodeTransferFunction(_account),
                0,
                {"from": accounts[0]}
            );
            let txIndex = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];

            await multiSigWallet.confirmTransaction(txIndex, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex, {"from": accounts[1]});

            await multiSigWallet.executeTransaction(txIndex, {"from": accounts[1]});
        }
        

        const _stakeMainGetVe = async (_account) => {

            await _transferFromMultiSigTreasury(_account);
            await FTHMToken.approve(vaultService.address, T_TO_STAKE, {from: _account});
            await blockchain.increaseTime(20);

            let unlockTime = lockingPeriod;

            await stakingService.createLock(T_TO_STAKE, unlockTime,{from: _account, gas: 600000});
        }

        it('Stake MainToken and receive vMainToken', async() => {
            // Here Staker 1 and staker 2 receive vMainTokens for staking MainTokens
            await _stakeMainGetVe(STAKER_1);
            await _stakeMainGetVe(STAKER_2);

            // Wait 1 block
            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            await blockchain.mineBlock(timestamp + 1);

        });


        it('Should revert transfer if holder is not whitelisted to transfer', async() => {

            let errorMessage = "VMainToken: is intransferable unless the sender is whitelisted";

            await shouldRevert(
                vMainToken.transfer(
                    accounts[2],
                    "10",
                    {from: accounts[1]}
                ),
                errTypes.revert,
                errorMessage
            ); 
        });
    });

    describe("Update Parameter Through Governer", async() => {

        it('Should revert proposal if: proposer votes below proposal threshold', async() => {

            let errorMessage = "Governor: proposer votes below proposal threshold";

            await shouldRevert(
                mainTokenGovernor.propose(
                    [box.address],
                    [0],
                    [encoded_function],
                    PROPOSAL_DESCRIPTION,
                    {"from": accounts[9]}
                ),
                errTypes.revert,
                errorMessage
            );
        });

        it('Propose a change to the boxs store value', async() => {

            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [box.address],
                [0],
                [encoded_function],
                PROPOSAL_DESCRIPTION,
                {"from": STAKER_1}
            );
            // retrieve the proposal id
            proposalId = eventsHelper.getIndexedEventArgs(result, PROPOSAL_CREATED_EVENT)[0];    
        });

        it('Check that the proposal status is: Pending', async() => {
            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("0");
        })

        it('Wait two blocks and then check that the proposal status is: Active', async() => {

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

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Vote:
            await mainTokenGovernor.castVote(proposalId, "1", {"from": STAKER_1});
        });

        it('Wait 40 blocks and then check that the proposal status is: Succeeded', async() => {
            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
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
        })

        it('Should retrieve the updated value proposed by governance for the new store value in box.sol', async() => {

            const new_val = await box.retrieve();
            // Test if the returned value is the new value
            expect((await box.retrieve()).toString()).to.equal(NEW_STORE_VALUE);
        });
    });

    describe("VC Treasury Distribution Through Governor", async() => {

        const _transferFromMultiSigTreasury = async (_account) => {
            const result = await multiSigWallet.submitTransaction(
                FTHMToken.address, 
                EMPTY_BYTES, 
                _encodeTransferFunction(_account),
                0,
                {"from": accounts[0]}
            );
            txIndex4 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];

            await multiSigWallet.confirmTransaction(txIndex4, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex4, {"from": accounts[1]});

            await multiSigWallet.executeTransaction(txIndex4, {"from": accounts[1]});
        }
        

        const _stakeMainGetVe = async (_account) => {
            
            await _transferFromMultiSigTreasury(_account);
            await FTHMToken.approve(vaultService.address, T_TO_STAKE, {from: _account});
            await blockchain.increaseTime(20);

            let unlockTime = lockingPeriod;

            await stakingService.createLock(T_TO_STAKE, unlockTime, {from: _account, gas: 600000});
        }

        it('Create proposal to send VC funds from MultiSig treasury to account 5', async() => {
            const eightHours = 28800
            await blockchain.mineBlock(await _getTimeStamp() + eightHours);  
            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [multiSigWallet.address],
                [0],
                [encoded_treasury_function],
                PROPOSAL_DESCRIPTION_2,
                {"from": STAKER_1}
            );

            // retrieve the proposal id
            proposalId2 = eventsHelper.getIndexedEventArgs(result, PROPOSAL_CREATED_EVENT)[0];
   
        });

        it("Should retrieve voting weights", async () => {

            const currentNumber = await web3.eth.getBlockNumber();

            expect(parseInt((await mainTokenGovernor.getVotes(STAKER_1, currentNumber - 1 )).toString())).to.be.above(parseInt(STAKED_MIN));
            expect(parseInt((await mainTokenGovernor.getVotes(STAKER_2, currentNumber - 1 )).toString())).to.be.above(parseInt(STAKED_MIN));
            assert.equal( await mainTokenGovernor.getVotes(NOT_STAKER, currentNumber - 1 ), "0");
        });


        it('Vote on the second proposal', async() => {

            // enum VoteType {
            //     Against,
            //     For,
            //     Abstain
            // }
            // =>  0 = Against, 1 = For, 2 = Abstain 

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Vote:
            await mainTokenGovernor.castVote(proposalId2, "1", {"from": STAKER_1});

        });

        it("Should not allow an account to vote twice on the same proposal", async () => {
            const errorMessage = "GovernorVotingSimple: vote already cast";
              
            await shouldRevert(
                mainTokenGovernor.castVote(proposalId2, "1", {"from": STAKER_1}),
                errTypes.revert,
                errorMessage
            ); 
            
        });

        it("Should not vote outside of option range", async () => {
            const errorMessage = "GovernorVotingSimple: invalid value for enum VoteType";
              
            await shouldRevert(
                mainTokenGovernor.castVote(proposalId2, "3", {"from": STAKER_2}),
                errTypes.revert,
                errorMessage
            ); 
        });


        it('Wait 40 blocks and then check that the proposal status is: Succeeded', async() => {
            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock);
                nextBlock++;              
            }
            // Check that the proposal is succesful:
            expect((await mainTokenGovernor.state(proposalId2)).toString()).to.equal("4"); 
        });


        it("Should not accept votes outside of the voting period", async () => {
            const errorMessage = "Governor: vote not currently active";
              
            await shouldRevert(
                mainTokenGovernor.castVote(proposalId2, "1", {"from": STAKER_1}),
                errTypes.revert,
                errorMessage
            );            
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
            encodedConfirmation1 = _encodeConfirmation(proposalId2);

            const result = await multiSigWallet.submitTransaction(
                mainTokenGovernor.address, 
                EMPTY_BYTES, 
                encodedConfirmation1,
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

        it('Wait 40 blocks and then check that the proposal status is: Queued', async() => {
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

        it('Confirm and Execute the release of funds from MultiSig treasury', async() => {
            // Here the acocunts which have been designated a "Signer" role for the governor 
            //      need to confirm each transaction before it can be executed.
            await multiSigWallet.confirmTransaction(txIndex, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex, {"from": accounts[1]});
            // Execute:
            await multiSigWallet.executeTransaction(txIndex, {"from": accounts[0]});
            // Balance of account 5 should reflect the funds distributed from treasury in proposal 2
            expect((await FTHMToken.balanceOf(STAKER_1, {"from": STAKER_1})).toString()).to.equal(AMOUNT_OUT_TREASURY);
        });

        it('Mint MainToken token to everyone', async() => {

            // This test is in preperation for front end UI tests which need accounts[0] to have a balance of more than 1000 voting tokens

            await _stakeMainGetVe(accounts[0]);
            await _stakeMainGetVe(accounts[0]);

            await _stakeMainGetVe(accounts[9]);
            await _stakeMainGetVe(accounts[9]);

        });

        it('Propose to add supporting Token', async() => {
            const eightHours = 28800
            await blockchain.increaseTime(eightHours)
            encoded_function_add_supporting_token = web3.eth.abi.encodeFunctionCall({
                name: 'addSupportingToken',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_token'
                }]
            }, [streamReward1.address]);
            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [mainTokenGovernor.address],
                [0],
                [encoded_function_add_supporting_token],
                PROPOSAL_DESCRIPTION,
                {"from": STAKER_1}
            );
            // retrieve the proposal id
            proposalIdForAddingSupportedToken = eventsHelper.getIndexedEventArgs(result, PROPOSAL_CREATED_EVENT)[0];    
        });

        it('Wait two blocks and then check that the proposal status is: Active', async() => {

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;    
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Check that the proposal is open for voting
            expect((await mainTokenGovernor.state(proposalIdForAddingSupportedToken)).toString()).to.equal("1");
        });

        it('Vote on the proposal', async() => {

            // enum VoteType {
            //     Against,
            //     For,
            //     Abstain
            // }
            // =>  0 = Against, 1 = For, 2 = Abstain 

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Vote:
            await mainTokenGovernor.castVote(proposalIdForAddingSupportedToken, "1", {"from": STAKER_1});
        });

        it('Wait 40 blocks and then check that the proposal status is: Succeeded', async() => {
            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock);
                nextBlock++;              
            }

            expect((await mainTokenGovernor.state(proposalIdForAddingSupportedToken)).toString()).to.equal("4");
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
                [mainTokenGovernor.address],
                [0],
                [encoded_function_add_supporting_token],
                description_hash,
                {"from": accounts[0]}
            );            
        });

        
        it('Create multiSig transaction to confirm proposal for adding supported tokens', async() => {
            encodedConfirmation1 = _encodeConfirmation(proposalIdForAddingSupportedToken);

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
            expect((await mainTokenGovernor.state(proposalIdForAddingSupportedToken)).toString()).to.equal("5");
        });

        it('Execute the proposal', async() => {

            const result = await mainTokenGovernor.execute(      
                [mainTokenGovernor.address],
                [0],
                [encoded_function_add_supporting_token],
                description_hash,
                {"from": accounts[0]}
            );
        });
        /// ------------- Relay Token -------///
        it('Propose to add relay Token to other address', async() => {
            await streamReward1.transfer(mainTokenGovernor.address,web3.utils.toWei("10000","ether"),{from: accounts[0]});
            const eightHours = 28800
            await blockchain.increaseTime(eightHours)
            encoded_function_relay = web3.eth.abi.encodeFunctionCall({
                name: 'relay',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: 'target'
                },{
                    type: 'uint256',
                    name: 'value'
                },{
                    type: 'bytes',
                    name: 'data'
                }]
            }, [streamReward1.address, EMPTY_BYTES, _encodeTransferFunction(accounts[0])]);
            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [mainTokenGovernor.address],
                [0],
                [encoded_function_relay],
                PROPOSAL_DESCRIPTION,
                {"from": STAKER_1}
            );
            // retrieve the proposal id
            proposalIdForRelayFunction = eventsHelper.getIndexedEventArgs(result, PROPOSAL_CREATED_EVENT)[0];    
        });

        it('Wait two blocks and then check that the proposal status is: Active', async() => {

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;    
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Check that the proposal is open for voting
            expect((await mainTokenGovernor.state(proposalIdForRelayFunction)).toString()).to.equal("1");
        });

        it('Vote on the proposal', async() => {

            // enum VoteType {
            //     Against,
            //     For,
            //     Abstain
            // }
            // =>  0 = Against, 1 = For, 2 = Abstain 

            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 2) {   
                await blockchain.mineBlock(timestamp + nextBlock);    
                nextBlock++;              
            }
            // Vote:
            await mainTokenGovernor.castVote(proposalIdForRelayFunction, "1", {"from": STAKER_1});
        });

        it('Wait 40 blocks and then check that the proposal status is: Succeeded', async() => {
            const currentNumber = await web3.eth.getBlockNumber();
            const block = await web3.eth.getBlock(currentNumber);
            const timestamp = block.timestamp;
            
            var nextBlock = 1;
            while (nextBlock <= 40) {   
                await blockchain.mineBlock(timestamp + nextBlock);
                nextBlock++;              
            }

            expect((await mainTokenGovernor.state(proposalIdForRelayFunction)).toString()).to.equal("4");
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
                [mainTokenGovernor.address],
                [0],
                [encoded_function_relay],
                description_hash,
                {"from": accounts[0]}
            );            
        });

        
        it('Create multiSig transaction to confirm proposal for relaying supported tokens', async() => {
            encodedConfirmation1 = _encodeConfirmation(proposalIdForRelayFunction);

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
            expect((await mainTokenGovernor.state(proposalIdForRelayFunction)).toString()).to.equal("5");
        });

        it('Execute the proposal', async() => {

            const result = await mainTokenGovernor.execute(      
                [mainTokenGovernor.address],
                [0],
                [encoded_function_relay],
                description_hash,
                {"from": accounts[0],
            }
            );
        });
    });
});

