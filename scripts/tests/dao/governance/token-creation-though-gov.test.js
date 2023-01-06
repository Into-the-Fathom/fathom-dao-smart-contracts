const blockchain = require("../../helpers/blockchain");
const eventsHelper = require("../../helpers/eventsHelper");
const {
    shouldRevert,
    errTypes
} = require('../../helpers/expectThrow');

const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';


// Proposal 1
const PROPOSAL_DESCRIPTION = "Proposal #1: Store 1 in the erc20Factory contract";

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
const STAKER_1 = accounts[5];
const STAKER_2 = accounts[6];

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

describe('Token Creation Through Governance', () => {

    let timelockController
    let vMainToken
    let mainTokenGovernor
    let erc20Factory
    let proxyAddress;
    
    let proposer_role
    let executor_role
    let timelock_admin_role
    let deployer_role

    let proposalId
    let result
    let encoded_factory_function
    let description_hash

    let lockingPeriod
    
    before(async () => {
        await snapshot.revertToSnapshot();
        timelockController = await artifacts.initializeInterfaceAt("TimelockController", "TimelockController");
        vMainToken = await artifacts.initializeInterfaceAt("VMainToken", "VMainToken");
        mainTokenGovernor = await artifacts.initializeInterfaceAt("MainTokenGovernor", "MainTokenGovernor");
        erc20Factory = await artifacts.initializeInterfaceAt("ERC20Factory", "ERC20Factory");
        mainToken = await artifacts.initializeInterfaceAt("MainToken", "MainToken");
        multiSigWallet = await artifacts.initializeInterfaceAt("MultiSigWallet", "MultiSigWallet");
        
        proposer_role = await timelockController.PROPOSER_ROLE();
        executor_role = await timelockController.EXECUTOR_ROLE();
        timelock_admin_role = await timelockController.TIMELOCK_ADMIN_ROLE();
        deployer_role = await erc20Factory.DEPLOYER_ROLE();

        // stakingService = await artifacts.initializeInterfaceAt(
        //     "IStaking",
        //     "StakingPackage"
        // );

        // vaultService = await artifacts.initializeInterfaceAt(
        //     "VaultPackage",
        //     "VaultPackage"
        // );

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

        // encode the function call to release funds from MultiSig treasury.  To be performed if the vote passes
        encoded_factory_function = web3.eth.abi.encodeFunctionCall({
            name: 'deployToken',
            type: 'function',
            inputs: [{
                type: 'string',
                name: '_name'
            },{
                type: 'string',
                name: '_ticker'
            },{
                type: 'uint256',
                name: '_supply'
            }]
        }, ["Test Token", "TT", 1000000000]);

        description_hash = web3.utils.keccak256(PROPOSAL_DESCRIPTION);

    });

    describe("Factory initialisation", async() => {

        it('Transfer ownership of the erc20Factory', async() => {
            
            await erc20Factory.grantRole(deployer_role, timelockController.address, {"from": accounts[0]});
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

    describe("Create New Token Through Governance", async() => {

        it('Should revert proposal if: proposer votes below proposal threshold', async() => {

            let errorMessage = "Governor: proposer votes below proposal threshold";

            await shouldRevert(
                mainTokenGovernor.propose(
                    [erc20Factory.address],
                    [0],
                    [encoded_factory_function],
                    PROPOSAL_DESCRIPTION,
                    {"from": accounts[9]}
                ),
                errTypes.revert,
                errorMessage
            );
        });

        it('Propose a new token to be created', async() => {

            // create a proposal in MainToken governor
            result = await mainTokenGovernor.propose(
                [erc20Factory.address],
                [0],
                [encoded_factory_function],
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
                [erc20Factory.address],
                [0],
                [encoded_factory_function],
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

        it('Check that the proposal status is: Queued', async() => {

            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("5");
        });

        it('Execute the proposal', async() => {

            const result = await mainTokenGovernor.execute(      
                [erc20Factory.address],
                [0],
                [encoded_factory_function],
                description_hash,
                {"from": accounts[0]}
            );
        });

        it('Check that the proposal status is: succesful', async() => {
            expect((await mainTokenGovernor.state(proposalId)).toString()).to.equal("7");
        })
    });
});

