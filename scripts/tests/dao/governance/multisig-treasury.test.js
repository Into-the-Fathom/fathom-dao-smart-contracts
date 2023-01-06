const blockchain = require("../../helpers/blockchain");
const eventsHelper = require("../../helpers/eventsHelper");
const {
    shouldRevert,
    errTypes
} = require('../../helpers/expectThrow');

// constants
const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';
// event
const SUBMIT_TRANSACTION_EVENT = "SubmitTransaction(uint256,address,address,uint256,bytes)";

// Token variables
const AMOUNT_OUT_TREASURY = "1000";
const oneYr = 365 * 24 * 60 * 60;

const BENEFICIARY = accounts[0];

describe('MultiSig Wallet', () => {

    let mainToken
    let multiSigWallet
    let tokenTimelock

    let encoded_transfer_function
    let encoded_remove_owner_function
    let encoded_add_owner_function
    let txIndex1
    let txIndex2
    let txIndex3
    let txIndex4
    let initial_owners
    let owners_after_removal
    let owners_after_addition

    before(async () => {
        await snapshot.revertToSnapshot();

        mainToken = await artifacts.initializeInterfaceAt("MainToken", "MainToken");
        multiSigWallet = await artifacts.initializeInterfaceAt("MultiSigWallet", "MultiSigWallet");
        tokenTimelock = await artifacts.initializeInterfaceAt("TokenTimelock", "TokenTimelock");


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
        }, [tokenTimelock.address, AMOUNT_OUT_TREASURY]);

        encoded_remove_owner_function = web3.eth.abi.encodeFunctionCall({
            name: 'removeOwner',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'owner'
            }]
        }, [accounts[2]]);

        encoded_add_owners_function = web3.eth.abi.encodeFunctionCall({
            name: 'addOwners',
            type: 'function',
            inputs: [{
                type: 'address[]',
                name: 'owner'
            }]
        }, [[accounts[2]]]);

        encoded_change_requirement_function = web3.eth.abi.encodeFunctionCall({
            name: 'changeRequirement',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: '_required'
            }]
        }, ['2']);

    });

    describe("MultiSig Ownership", async() => {
        it('Create transaction to add an owner using submitTransaction', async() => {
            const result = await multiSigWallet.submitTransaction(
                multiSigWallet.address, 
                EMPTY_BYTES, 
                encoded_add_owners_function,
                0,
                {"from": accounts[0]}
            );
            txIndex1 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        });

        it('Create transaction to remove an owner using submitTransaction', async() => {
            const result = await multiSigWallet.submitTransaction(
                multiSigWallet.address, 
                EMPTY_BYTES, 
                encoded_remove_owner_function,
                0,
                {"from": accounts[0]}
            );
            txIndex2 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        });

        it('Create transaction to change the number of required signatures using submitTransaction', async() => {

            const result = await multiSigWallet.submitTransaction(
                multiSigWallet.address, 
                EMPTY_BYTES, 
                encoded_change_requirement_function,
                0,
                {"from": accounts[0]}
            );
            txIndex3 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        });

        it('Shoud revert when trying to directly remove or add an owner', async() => {
            let errorMessage = "MultiSig: Only this wallet can use this funciton";
            initial_owners = await multiSigWallet.getOwners();

            await shouldRevert(
                multiSigWallet.removeOwner(initial_owners[1], {"from": accounts[1]}),
                errTypes.revert,
                errorMessage
            );

            await shouldRevert(
                multiSigWallet.addOwners([accounts[3]], {"from": accounts[1]}),
                errTypes.revert,
                errorMessage
            );
        });

        it('Should confirm transaction 1, 2 and 3, from accounts[0], the first signer', async() => {
            await multiSigWallet.confirmTransaction(txIndex1, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex2, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex3, {"from": accounts[0]});
        });

        it('Shoud revert when trying to execute a transaction without enough signers', async() => {
            let errorMessage = "cannot execute tx";

            await shouldRevert(
                multiSigWallet.executeTransaction(txIndex1, {from: accounts[0]}),
                errTypes.revert,
                errorMessage
            );
        });

        it('Should confirm transactions 1, 2 and 3, only, from accounts[1], the second signer', async() => {
            await multiSigWallet.confirmTransaction(txIndex1, {"from": accounts[1]});
            await multiSigWallet.confirmTransaction(txIndex2, {"from": accounts[1]});
            await multiSigWallet.confirmTransaction(txIndex3, {"from": accounts[1]});
        });

        it('Revoke confirmation for tx 1 and expect transaction to fail when execution is tried, then reconfirm', async() => {

            await multiSigWallet.revokeConfirmation(txIndex1, {from: accounts[1]});

            let errorMessage = "cannot execute tx";

            await shouldRevert(
                multiSigWallet.executeTransaction(txIndex1, {from: accounts[1]}),
                errTypes.revert,
                errorMessage
            );

            await multiSigWallet.confirmTransaction(txIndex1, {"from": accounts[1]});
        });

        it('Execute the transaction to ADD an owner', async() => {
            await multiSigWallet.executeTransaction(txIndex1, {"from": accounts[0]});

            owners_after_removal = await multiSigWallet.getOwners();

            expect((owners_after_removal).length).to.equal(3);
            expect((owners_after_removal[0])).to.equal(accounts[0]);
            expect((owners_after_removal[1])).to.equal(accounts[1]);
        });

        it('Should confirm transactions 3, only, from accounts[3], the third signer', async() => {
            await multiSigWallet.confirmTransaction(txIndex3, {"from": accounts[2]});
        });

        it('Revoke confirmation for tx 3 and expect transaction to fail when execution is tried, then reconfirm', async() => {

            await multiSigWallet.revokeConfirmation(txIndex3, {from: accounts[1]});

            let errorMessage = "cannot execute tx";

            await shouldRevert(
                multiSigWallet.executeTransaction(txIndex3, {from: accounts[1]}),
                errTypes.revert,
                errorMessage
            );

            await multiSigWallet.confirmTransaction(txIndex3, {"from": accounts[1]});
        });

        it('Fail xecute the transaction to remove third signer because min number of confirmations not reached', async() => {
            let errorMessage = "cannot execute tx";

            await shouldRevert(
                multiSigWallet.executeTransaction(txIndex2, {from: accounts[0]}),
                errTypes.revert,
                errorMessage
            );
        });

        it('Execute the transaction to change the minimum number of required confirmations to execute a proposal', async() => {
            await multiSigWallet.executeTransaction(txIndex3, {"from": accounts[0]});
        });

        it('Execute the transaction to REMOVE an owner, even though it was only signed by two account', async() => {
            await multiSigWallet.executeTransaction(txIndex2, {"from": accounts[0]});
            owners_after_addition = await multiSigWallet.getOwners();

            expect((owners_after_addition).length).to.equal(2);
            expect((owners_after_addition[0])).to.equal(accounts[0]);
            expect((owners_after_addition[1])).to.equal(accounts[1]);
        });

    });

    describe("Token distribution with 1 year cliff", async() => {
        it('Create transaction to release funds from MultiSig treasury to TokenTimelock', async() => {
            const result = await multiSigWallet.submitTransaction(
                mainToken.address, 
                EMPTY_BYTES, 
                encoded_transfer_function,
                0,
                {"from": accounts[0]}
            );
            txIndex4 = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        });

        it('Confirm and Execute the release of funds from MultiSig treasury to TokenTimelock', async() => {
            // Here the accounts which have been designated a "Signer" role for the governor 
            //      need to confirm each transaction before it can be executed.
            await multiSigWallet.confirmTransaction(txIndex4, {"from": accounts[0]});
            await multiSigWallet.confirmTransaction(txIndex4, {"from": accounts[1]});
            // Execute:
            await multiSigWallet.executeTransaction(txIndex4, {"from": accounts[1]});

            expect((await mainToken.balanceOf(tokenTimelock.address, {"from": accounts[0]})).toString()).to.equal(AMOUNT_OUT_TREASURY);
        });

        it('Shoud revert when trying to claim tokens too early', async() => {
            let errorMessage = "TokenTimelock: current time is before release time";
            initial_owners = await multiSigWallet.getOwners();

            await shouldRevert(
                tokenTimelock.release( {"from": BENEFICIARY}),
                errTypes.revert,
                errorMessage
            );
        });

        it('Shoud revert when trying to claim tokens too early', async() => {
            let errorMessage = "TokenTimelock: current time is before release time";
            initial_owners = await multiSigWallet.getOwners();

            await shouldRevert(
                tokenTimelock.release( {"from": BENEFICIARY}),
                errTypes.revert,
                errorMessage
            );
        });
        
        it('Shoud release funds to beneficiary', async() => {

            expect((await mainToken.balanceOf(BENEFICIARY, 
                {"from": BENEFICIARY})).toString()).to.equal("0");
            
            await blockchain.increaseTime(oneYr);

            await tokenTimelock.release( {"from": BENEFICIARY});

            expect((await mainToken.balanceOf(BENEFICIARY, 
                {"from": BENEFICIARY})).toString()).to.equal(AMOUNT_OUT_TREASURY);
        });
    });
});


