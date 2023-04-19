//NOTE: This script can be run only once for each deployment as making COUNCIL_STAKES is only possible once
const fs = require('fs');

const constants = require('./helpers/constants')
const txnHelper = require('./helpers/submitAndExecuteTransaction')
const IStaking = artifacts.require('./dao/staking/interfaces/IStaking.sol');

const env = process.env.NODE_ENV || 'dev';
const addressesConfig = require(`../../config/config.${env}`)


const LOCK_PERIOD = 365 * 24 * 60 * 60;
//SET AS NEEDED
// this needs to be sum of all the stakes. Right now 10KK * 3. 
// NOT MAX UINT for security as its not good to approve max for Multisig
const T_TOTAL_TO_APPROVE = web3.utils.toWei('30000000', 'ether');
// this is how much to stake for one council . Right now 10KK
const T_TO_STAKE = web3.utils.toWei('10000000', 'ether');

const COUNCIL_1 = addressesConfig.COUNCIL_1;
const COUNCIL_2 = addressesConfig.COUNCIL_2;
const COUNCIL_3 = addressesConfig.COUNCIL_3;

const rawdata = fs.readFileSync(constants.PATH_TO_ADDRESSES);
const addresses = JSON.parse(rawdata);

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
        name:'createFixedLocksOnBehalfOfUserByAdmin',
        type:'function',
        inputs: [{
                type: 'tuple[]',
                name: 'lockPositions',
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
    const stakingService = await IStaking.at(addresses.staking);
    

    await txnHelper.submitAndExecute(
        _encodeApproveFunction(stakingService.address,T_TOTAL_TO_APPROVE),
        addresses.fthmToken,
        "ApproveFathomTxn"
    )
    
    const LockPositionForCouncil_1 =  _createLockParamObject(T_TO_STAKE,LOCK_PERIOD,COUNCIL_1)
    const LockPositionForCouncil_2 =  _createLockParamObject(T_TO_STAKE,LOCK_PERIOD,COUNCIL_2)
    const LockPositionForCouncil_3 =  _createLockParamObject(T_TO_STAKE,LOCK_PERIOD,COUNCIL_3)
   
    const LockParamObjectForAllCouncils = [
        LockPositionForCouncil_1,
        LockPositionForCouncil_2,
        LockPositionForCouncil_3
    ]
    
    await txnHelper.submitAndExecute(
        _encodeCreateLocksForCouncils(LockParamObjectForAllCouncils),
        stakingService.address,
        "createLocksForCouncilTxn"
    )
}