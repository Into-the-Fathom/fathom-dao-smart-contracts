const fs = require('fs');
const txnHelper = require('../../helpers/submitAndExecuteTransaction')
const rawdataExternal = fs.readFileSync('../../../../config/external-addresses.json');
const addressesExternal = JSON.parse(rawdataExternal);

const STABLE_SWAP_ADDRESS =addressesExternal.STABLE_SWAP_ADDRESS

const _encodePause = () => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'pause',
        type: 'function',
        inputs: []
    }, []);
    return toRet;
}


module.exports = async function(deployer) {

    await txnHelper.submitAndExecute(
        _encodePause(),
        STABLE_SWAP_ADDRESS,
        "pauseStableSwap"
    )
}