const fs = require('fs');
const constants = require('./helpers/constants')

const txnHelper = require('./helpers/submitAndExecuteTransaction')

const IMultiSigWallet = artifacts.require("./dao/treasury/interfaces/IMultiSigWallet.sol");
const rawdata = fs.readFileSync(constants.PATH_TO_ADDRESSES);
const addresses = JSON.parse(rawdata);
const IUniswapRouter = artifacts.require("./dao/test/dex/IUniswapV2Router01.sol");


const env = process.env.NODE_ENV || 'dev';
const addressesConfig = require(`../../config/config.${env}`)
const WETH_ADDRESS = addressesConfig.WETH_ADDRESS
const TOKEN_ADDRESS = addressesConfig.USD_ADDRESS 

const AMOUNT_OUT_ETH = '2'
const SLIPPAGE = 0.05

const DEX_ROUTER_ADDRESS = addressesConfig.DEX_ROUTER_ADDRESS
const _encodeApproveFunction = (_account, _amount) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'approve',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'spender'
        },{
            type: 'uint256',
            name: 'amount'
        }]
    }, [_account, _amount]);

    return toRet;
}

const _encodeSwapTokensForExactETH = (
    _amountOut,
    _amountInMax,
    _path,
    _to,
    _deadline
) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'swapTokensForExactETH',
        type: 'function',
        inputs: [
        {
            type: 'uint256',
            name: 'amountOut'
        },
        {
            type: 'uint256',
            name: 'amountInMax'
        },
        {
            type: 'address[]',
            name: 'path'
        },
        {
            type: 'address',
            name: 'to'
        },
        {
            type: 'uint256',
            name: 'deadline'
        },
       ]
    }, [_amountOut,
        _amountInMax,
        _path,
        _to,
        _deadline]);

    return toRet;
}


module.exports = async function(deployer) {
    // we want to swap tokens for exact eth
    const multiSigWallet = await IMultiSigWallet.at(addresses.multiSigWallet);
    const uniswapRouter = await IUniswapRouter.at(addressesConfig.DEX_ROUTER_ADDRESS)
    //path to swap Token to Fixed ETH
    const path = [TOKEN_ADDRESS,WETH_ADDRESS] 
    const deadline =  await getDeadlineTimestamp(10000)
    //we set amounts out, ie fixed amount of eth we want to get
    const amountOut = web3.utils.toWei(AMOUNT_OUT_ETH,'ether')
    //now we are retreiving how much amount of Token we can get for that eth
    const amounts = await uniswapRouter.getAmountsIn(amountOut, path)
    //now we are adding slippage to mark the maximum amount of token we want to swap for
    const amountInMax = String(amounts[0] + (amounts[0] * SLIPPAGE))

    await txnHelper.submitAndExecute(
        _encodeApproveFunction(DEX_ROUTER_ADDRESS,amountInMax),
        TOKEN_ADDRESS,
        "ApproveDexXDC"
    )

    await txnHelper.submitAndExecute(
        _encodeSwapTokensForExactETH(
            amountOut,
            amountInMax,
            path,
            multiSigWallet.address,
            deadline
        ),
        DEX_ROUTER_ADDRESS,
        "SwapTokensForExactETH",
    )
}
  
async function getDeadlineTimestamp(deadline) {
    return Math.floor(Date.now() / 1000) + deadline
}