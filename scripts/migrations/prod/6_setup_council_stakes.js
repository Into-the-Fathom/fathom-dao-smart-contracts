const eventsHelper = require("../../tests/helpers/eventsHelper");

const IStaking = artifacts.require('./dao/staking/interfaces/IStaking.sol');

const MainToken = artifacts.require("./dao/tokens/MainToken.sol");
const IERC20 = artifacts.require("./dao/tokens/ERC20/IERC20.sol");

const MultiSigWallet = artifacts.require("./dao/treasury/MultiSigWallet.sol");
const IMultiSigWallet = artifacts.require("./dao/treasury/interfaces/IMultiSigWallet.sol");

const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';
const SUBMIT_TRANSACTION_EVENT = "SubmitTransaction(uint256,address,address,uint256,bytes)";

const LOCK_PERIOD = 365 * 24 * 60 * 60;

const T_TO_TRANSFER = web3.utils.toWei('150000', 'ether');
const T_TO_STAKE = web3.utils.toWei('50000', 'ether');

const COUNCIL_1 = "0xc0Ee98ac1a44B56fbe2669A3B3C006DEB6fDd0f9";
const COUNCIL_2 = "0x01d2D3da7a42F64e7Dc6Ae405F169836556adC86";
const StakingProxy = artifacts.require('./common/proxy/StakingProxy.sol')
const VaultProxy = artifacts.require('./common/proxy/VaultProxy.sol')

const _createLockParamObject = (
    _amount,
    _lockPeriod,
    _account) => {
    return {
        amount: _amount,
        lockPeriod: _lockPeriod,
        account: _account
    }
}
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

const _encodeCreateLocksForCouncils = (_createLockParam) => {
    let toRet = web3.eth.abi.encodeFunctionCall({
        name:'createLocksForCouncils',
        type:'function',
        inputs: [{
                type: 'tuple[]',
                name: 'CreateLockParams',
                components: [
                    {"type":"uint256", "name":"amount"},
                    {"type":"uint256", "name":"lockPeriod"},
                    {"type":"address", "name":"account"}
                ]
            }
        ]
    },[_createLockParam])
    return toRet
}

module.exports = async function(deployer) {
    const stakingService = await IStaking.at(StakingProxy.address);
    const multiSigWallet = await IMultiSigWallet.at(MultiSigWallet.address);
    const mainToken = await IERC20.at(MainToken.address);

    let resultApprove = await multiSigWallet.submitTransaction(
        MainToken.address,
        EMPTY_BYTES,
        _encodeApproveFunction(VaultProxy.address,T_TO_TRANSFER),
        0,
        {gas: 8000000}
    )
    
    let txIndexApprove = eventsHelper.getIndexedEventArgs(resultApprove, SUBMIT_TRANSACTION_EVENT)[0];
    await multiSigWallet.confirmTransaction(txIndexApprove, {gas: 8000000});
    await multiSigWallet.executeTransaction(txIndexApprove, {gas: 8000000});

    const LockParamObjectForAllCouncils = [
        _createLockParamObject(T_TO_STAKE,LOCK_PERIOD,accounts[0]),
        _createLockParamObject(T_TO_STAKE,LOCK_PERIOD,COUNCIL_1),
        _createLockParamObject(T_TO_STAKE,LOCK_PERIOD,COUNCIL_2)
    ]

    let resultCreateLock = await multiSigWallet.submitTransaction(
        stakingService.address,
        EMPTY_BYTES,
        _encodeCreateLocksForCouncils(LockParamObjectForAllCouncils),
        0,
        {gas: 8000000}
    )
    
    let txIndexCreateLock = eventsHelper.getIndexedEventArgs(resultCreateLock, SUBMIT_TRANSACTION_EVENT)[0];
    await multiSigWallet.confirmTransaction(txIndexCreateLock, {gas: 8000000});
    await multiSigWallet.executeTransaction(txIndexCreateLock, {gas: 8000000});
}