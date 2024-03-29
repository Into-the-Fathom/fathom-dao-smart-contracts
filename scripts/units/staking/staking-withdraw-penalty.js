const fs = require('fs');
const txnHelper = require('../helpers/submitAndExecuteTransaction')

const constants = require('../helpers/constants')
const addressesConfig = require(constants.PATH_TO_ADDRESSES_FOR_DEX_FOLDER)
const FEE_TO_SETTER = ""
const STAKING_ADDRESS = addressesConfig.STAKING_ADDRESS
const VAULT = ""

const _encodeWithdrawPenalty = () => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'withdrawPenalty',
        type: 'function',
        inputs: []
    }, []);

    return toRet;
}


module.exports = async function(deployer) {
    
    await txnHelper.submitAndExecute(
        _encodeWithdrawPenalty(),
        STAKING_ADDRESS,
        "withdraw penalty"
    )
}