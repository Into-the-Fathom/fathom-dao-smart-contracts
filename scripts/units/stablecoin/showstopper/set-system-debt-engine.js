const fs = require('fs');
const txnHelper = require('../../helpers/submitAndExecuteTransaction')

const constants = require('../../helpers/constants')
const addressesConfig = require(constants.PATH_TO_ADDRESSES_FOR_STABLECOIN_FOLDER)

const SYSTEM_DEBT_ENGINE = ""
const SHOW_STOPPER_ADDRESS =addressesConfig.SHOW_STOPPER_ADDRESS

const _encodeSetSystemDebtEngine = (_systemDebtEngine) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'setSystemDebtEngine',
        type: 'function',
        inputs: [{
            type: 'address',
            name: '_systemDebtEngine'
        }]
    }, [_systemDebtEngine]);

    return toRet;
}


module.exports = async function(deployer) {

    await txnHelper.submitAndExecute(
        _encodeSetSystemDebtEngine(SYSTEM_DEBT_ENGINE),
        SHOW_STOPPER_ADDRESS,
        "setSystemDebtEngine"
    )
}