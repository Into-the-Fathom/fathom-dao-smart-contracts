const MainToken = artifacts.require("./dao/tokens/MainToken.sol");
const VaultProxyAdmin = artifacts.require('./common/proxy/VaultProxyAdmin.sol');
const VaultProxy = artifacts.require('./common/proxy/VaultProxy.sol')
const Vault = artifacts.require('./dao/staking/vault/packages/VaultPackage.sol');
const MultiSigWallet = artifacts.require("./dao/treasury/MultiSigWallet.sol");


module.exports = async function(deployer) {

    let toInitialize =  web3.eth.abi.encodeFunctionCall({
        name: 'initVault',
        type: 'function',
        inputs: [{
                type: 'address',
                name: '_admin'
            },
            {
                type: 'address[]',
                name: 'supportedTokens'
            }
          ]
        },  [MultiSigWallet.address,[MainToken.address]]);

    await deployer.deploy(VaultProxyAdmin, {gas:8000000});
    await deployer.deploy(VaultProxy, Vault.address, VaultProxyAdmin.address, toInitialize, {gas:8000000});
}