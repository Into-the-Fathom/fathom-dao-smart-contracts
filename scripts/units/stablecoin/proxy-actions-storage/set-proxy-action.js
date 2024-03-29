const fs = require('fs');
const txnHelper = require('../../helpers/submitAndExecuteTransaction')

const constants = require('../../helpers/constants')
const addressesConfig = require(constants.PATH_TO_ADDRESSES_FOR_STABLECOIN_FOLDER)

const PROXY_ACTION_STORAGE_ADDRESS =addressesConfig.PROXY_ACTION_STORAGE_ADDRESS
const PROXY_ACTION_ADDRESS = "0x"
const _encodeSetProxyAction = (_proxyAction) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'setProxyAction',
        type: 'function',
        inputs: [{
            type: 'address',
            name: '_proxyAction'
        }]
    }, [_proxyAction]);

    return toRet;
}


module.exports = async function(deployer) {

    await txnHelper.submitAndExecute(
        _encodeSetProxyAction(PROXY_ACTION_STORAGE_ADDRESS),
        PROXY_ACTION_ADDRESS,
        "setProxyActionAddress"
    )
}