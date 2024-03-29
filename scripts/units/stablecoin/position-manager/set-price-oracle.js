const fs = require('fs');
const txnHelper = require('../../helpers/submitAndExecuteTransaction')

const constants = require('../../helpers/constants')
const addressesConfig = require(constants.PATH_TO_ADDRESSES_FOR_STABLECOIN_FOLDER)

const PRICE_ORACLE = ""
const POSITION_MANAGER_ADDRESS =addressesConfig.POSITION_MANAGER_ADDRESS

const _encodeSetPriceOracle = (_priceOracle) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'setPriceOracle',
        type: 'function',
        inputs: [{
            type: 'address',
            name: '_priceOracle'
        }]
    }, [_priceOracle]);

    return toRet;
}


module.exports = async function(deployer) {

    await txnHelper.submitAndExecute(
        _encodeSetPriceOracle(PRICE_ORACLE),
        POSITION_MANAGER_ADDRESS,
        "setPriceOracle-Position-manager"
    )
}