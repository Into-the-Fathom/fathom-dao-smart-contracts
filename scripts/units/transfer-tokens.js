const T_TO_TRANSFER_PLACEHOLDER = web3.utils.toWei('99999.99','ether') //SET AS NEEDED
const TRANSFER_TO_ACCOUNT_PLACEHOLDER = "0x9a337088801B30a3eB715937BCDE27A34BC62841" //SET AS NEEDED
const txnHelper = require('./helpers/submitAndExecuteTransaction')
const TOKEN_ADDRESS  = "0xf31146956Cb3be9EFD6Cfd665Cb4Cb5Aeeb5cA3e";
const _encodeTransferFunction = (_account, t_to_stake) => {

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
    }, [_account, t_to_stake]);

    return toRet;
}

module.exports = async function(deployer) {
    

    await txnHelper.submitAndExecute(
        _encodeTransferFunction(TRANSFER_TO_ACCOUNT_PLACEHOLDER, T_TO_TRANSFER_PLACEHOLDER),
        TOKEN_ADDRESS,
        "transfer Token from multisig"
    )
}