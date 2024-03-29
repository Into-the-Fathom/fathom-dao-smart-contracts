const fs = require('fs');
const path = require('path');

const constants = require('./helpers/constants') 
const eventsHelper = require("../tests/helpers/eventsHelper");
const txnSaver = require('./helpers/transactionSaver')

const IMultiSigWallet = artifacts.require("./dao/treasury/interfaces/IMultiSigWallet.sol");
let rawdata = fs.readFileSync(constants.PATH_TO_ADDRESSES);
const addresses = JSON.parse(rawdata);
const IProxyRegistry = artifacts.require("./dao/test/stablecoin/IProxyRegistry.sol");

const env = process.env.NODE_ENV || 'dev';
const addressesConfig = require(`../../config/config.${env}`)
const PROXY_WALLET_REGISTRY_ADDRESS = addressesConfig.PROXY_WALLET_REGISTRY_ADDRESS

const _encodeBuildFunction = (_account) => {
    let toRet =  web3.eth.abi.encodeFunctionCall({
        name: 'build',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'owner'
        }]
    }, [_account]);

    return toRet;
}


module.exports = async function(deployer) {
    const multiSigWallet = await IMultiSigWallet.at(addresses.multiSigWallet);
    const proxyRegistry = await IProxyRegistry.at(PROXY_WALLET_REGISTRY_ADDRESS)
    let resultBuild= await multiSigWallet.submitTransaction(
        PROXY_WALLET_REGISTRY_ADDRESS,
        constants.EMPTY_BYTES,
        _encodeBuildFunction(multiSigWallet.address),
        0,
        {gas: 8000000}
    )

    if (!resultBuild) {
        console.log(`Transaction failed to submit for Creating Proxy Wallet`);
        return;
    } else {
        console.log(`Transaction submitted successfully for Creating Proxy Wallet. TxHash: ${resultBuild.transactionHash}`);
    }
    
    let txIndexBuild = eventsHelper.getIndexedEventArgs(resultBuild, constants.SUBMIT_TRANSACTION_EVENT)[0];
    let resultConfirmTransaction = await multiSigWallet.confirmTransaction(txIndexBuild, {gas: 8000000});
    if (!resultConfirmTransaction) {
        console.log(`Transaction failed to confirm for Creating Proxy Wallet`);
        return;
    } else {
        console.log(`Transaction confirmed successfully for Creating Proxy Wallet. TxHash: ${resultConfirmTransaction.transactionHash}`);
    }
    
    let resultExecuteTransaction = await multiSigWallet.executeTransaction(txIndexBuild, {gas: 8000000});
    
    if (!resultExecuteTransaction) {
        console.log(`Transaction failed to execute for Creating Proxy Wallet`);
        return;
    } else {
        console.log(`Transaction executed successfully for Creating Proxy Wallet. TxHash: ${resultExecuteTransaction.transactionHash}`);
    }
    const proxyWalletAddress = await proxyRegistry.proxies(multiSigWallet.address)
    let addressesStableCoin = {
        proxyWallet: proxyWalletAddress
    }
    let data = JSON.stringify(addressesStableCoin);

    const filePath = (`./config/stablecoin-addresses-proxy-wallet.${env}.json`)
    const dirPath = path.dirname(filePath)

    if (fs.existsSync(filePath)) {
        rawdata = fs.readFileSync(filePath);
      } else if (!fs.existsSync(dirPath)) {
          // create new directory
          fs.mkdirSync(dirPath, { recursive: true });
          // create new file
          fs.writeFileSync(filePath, data);
          rawdata = fs.readFileSync(filePath);
      } else{
        // create new file
        fs.writeFileSync(filePath, data)
        rawdata = fs.readFileSync(filePath);
      }

    await txnSaver.saveTxnIndex("proxyWalletTxn", txIndexBuild)   
}