const fs = require('fs');
const txnHelper = require('../../helpers/submitAndExecuteTransaction')

const constants = require('../../helpers/constants')
const addressesConfig = require(constants.PATH_TO_ADDRESSES_FOR_STABLECOIN_FOLDER)

const BOOK_KEEPER_ADDRESS =addressesConfig.BOOK_KEEPER_ADDRESS
const TO_BE_BLOCKLISTED = "0x"
const _encodeBlocklist = (toBeBlocklistedAddress) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'blocklist',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'toBeBlocklistedAddress'
        }]
    }, [toBeBlocklistedAddress]);

    return toRet;
}


module.exports = async function(deployer) {

    await txnHelper.submitAndExecute(
        _encodeBlocklist(TO_BE_BLOCKLISTED),
        BOOK_KEEPER_ADDRESS,
        "setBlocklistedAddressBookkeeper"
    )
}