const MultiSigWallet = artifacts.require("./dao/treasury/MultiSigWallet.sol");
const StakingProxyAdmin = artifacts.require('./common/proxy/StakingProxyAdmin.sol');
const VaultProxyAdmin = artifacts.require('./common/proxy/VaultProxyAdmin.sol');

module.exports = async function(deployer) {
    const stakingProxyAdmin = await StakingProxyAdmin.at(StakingProxyAdmin.address)
    await stakingProxyAdmin.transferOwnership(MultiSigWallet.address)
    const vaultProxyAdmin = await VaultProxyAdmin.at(VaultProxyAdmin.address)
    await vaultProxyAdmin.transferOwnership(MultiSigWallet.address)
}