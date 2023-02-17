const fs = require('fs');

const eventsHelper = require("../tests/helpers/eventsHelper");


const IMultiSigWallet = artifacts.require("./dao/treasury/interfaces/IMultiSigWallet.sol");

const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';
const SUBMIT_TRANSACTION_EVENT = "SubmitTransaction(uint256,address,address,uint256,bytes)";
const rawdata = fs.readFileSync('../../addresses.json');
const addresses = JSON.parse(rawdata);
//RIGHT NOW SETUP FOR STAKING
const PROXY_ADMIN = "0x43d97AD756fe2b7E48a2384eD7c400Db37698167"
const PROXY = "0x06F32926169b922F5e885c8a31CB7e60D554A6E6"
const IMPLEMENTATION_ADDRESS = "0xe017a18Ad42abAE2e53F9A70EF037Ce52e2Eb484"
const _encodeUpgradeFunction = (_proxy, _impl) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'upgrade',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'proxy'
        },{
            type: 'address',
            name: 'implementation'
        }]
    }, [_proxy, _impl]);

    return toRet;
}


module.exports = async function(deployer) {
    const MULTISIG_WALLET_ADDRESS = addresses.multiSigWallet;
    const multiSigWallet = await IMultiSigWallet.at(MULTISIG_WALLET_ADDRESS);

    const _upgrade = async(
        _proxy,
        _impl
    ) => {
        const result = await multiSigWallet.submitTransaction(
            PROXY_ADMIN,
            EMPTY_BYTES,
            _encodeUpgradeFunction(
                _proxy,
                _impl
            ),0,{gas:8000000}
        )
        const tx = eventsHelper.getIndexedEventArgs(result, SUBMIT_TRANSACTION_EVENT)[0];
        await multiSigWallet.confirmTransaction(tx, {gas: 8000000});
        await multiSigWallet.executeTransaction(tx, {gas: 8000000});
    }

    await _upgrade(
        PROXY,
        IMPLEMENTATION_ADDRESS
    )
}