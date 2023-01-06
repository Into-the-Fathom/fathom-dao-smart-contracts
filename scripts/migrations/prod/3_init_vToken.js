const VMainToken = artifacts.require('./dao/tokens/VMainToken.sol');
const IVMainToken = artifacts.require('./dao/tokens/IVMainToken.sol');
const StakingProxy = artifacts.require('./common/proxy/StakingProxy.sol')
const MultiSigWallet = artifacts.require("./dao/treasury/MultiSigWallet.sol");

module.exports = async function(deployer) {
    const vToken = await IVMainToken.at(VMainToken.address);
    await vToken.initToken(MultiSigWallet.address, StakingProxy.address, {gas: 8000000});
}