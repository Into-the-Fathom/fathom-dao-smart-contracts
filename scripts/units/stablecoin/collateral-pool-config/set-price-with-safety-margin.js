const fs = require('fs');
const txnHelper = require('../../helpers/submitAndExecuteTransaction')
const rawdataExternal = fs.readFileSync('../../../../config/external-addresses.json');
const addressesExternal = JSON.parse(rawdataExternal);
const COLLATERAL_POOL_ID = ''
const PRICE_WITH_SAFETY_MARGIN = ''
const COLLATERAL_POOL_CONFIG_ADDRESS =addressesExternal.COLLATERAL_POOL_CONFIG_ADDRESS
const _encodeSetPriceWithSafetyMargin = (_collateralPoolId, _priceWithSafetyMargin) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'setPriceWithSafetyMargin',
        type: 'function',
        inputs: [{
            type: 'bytes32',
            name: '_collateralPoolId'
        },{
            type: 'uint256',
            name: '_priceWithSafetyMargin'
        }]
    }, [_collateralPoolId,_priceWithSafetyMargin]);

    return toRet;
}

module.exports = async function(deployer) {
    await txnHelper.submitAndExecute(
        _encodeSetPriceWithSafetyMargin(COLLATERAL_POOL_ID,PRICE_WITH_SAFETY_MARGIN),
        COLLATERAL_POOL_CONFIG_ADDRESS,
        "setPriceWithSafetyMargin"
    )
}