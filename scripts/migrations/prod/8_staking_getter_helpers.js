const StakingGettersHelper = artifacts.require('./dao/staking/helpers/StakingGettersHelper.sol')
const MultiSigWallet = artifacts.require("./dao/treasury/MultiSigWallet.sol");
const StakingProxy = artifacts.require('./common/proxy/StakingProxy.sol')

module.exports = async function(deployer) {
    let promises = [
        deployer.deploy(StakingGettersHelper, StakingProxy.address, MultiSigWallet.address, {gas: 8000000})
    ];
    await Promise.all(promises);
}