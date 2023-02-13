module.exports = {
  deploySepolia: [
    ['execute', '--path', 'scripts/migrations/deployment', '--network', 'sepolia'],
    ['execute', '--path', 'scripts/migrations/setup', '--network', 'sepolia'],
    ['execute', '--path', 'scripts/migrations/prod', '--network', 'sepolia'],
    ['execute', '--path', 'scripts/migrations/save-address', '--network', 'sepolia']
  ],
  deployApothem: [
    ['execute', '--path', 'scripts/migrations/deployment', '--network', 'apothem'],
    ['execute', '--path', 'scripts/migrations/save-address/1_save_address_deployment.js', '--network', 'apothem'],
    ['execute', '--path', 'scripts/migrations/setup', '--network', 'apothem'],
    ['execute', '--path', 'scripts/migrations/save-address/2_save_address_setup.js', '--network', 'apothem'],
    ['execute', '--path', 'scripts/migrations/prod', '--network', 'apothem'],
    ['execute', '--path', 'scripts/migrations/save-address/3_save_address_prod.js', '--network', 'apothem']
  ],
  deployXDC: [
    ['execute', '--path', 'scripts/migrations/deployment', '--network', 'xdc'],
    ['execute', '--path', 'scripts/migrations/save-address/1_save_address_deployment.js', '--network', 'xdc'],
    ['execute', '--path', 'scripts/migrations/setup', '--network', 'xdc'],
    ['execute', '--path', 'scripts/migrations/save-address/2_save_address_setup.js', '--network', 'xdc'],
    ['execute', '--path', 'scripts/migrations/prod', '--network', 'xdc'],
    ['execute', '--path', 'scripts/migrations/save-address/3_save_address_prod.js', '--network', 'xdc']
  ],
  migrateAndConfigureForTests: [
    ['compile'],
    ['execute', '--path', 'scripts/migrations/test-deployment'],
    ['execute', '--path', 'scripts/migrations/save-address/1_save_address_deployment.js'],
    ['execute', '--path', 'scripts/migrations/setup'],
    ['execute', '--path', 'scripts/migrations/save-address/2_save_address_setup.js'],
    ['execute', '--path', 'scripts/migrations/test'],
    ['execute', '--path', 'scripts/migrations/save-address/3_save_address_prod.js'],
    ['execute', '--path', 'scripts/migrations/upgrades'],
  ],
  createStablecoinPool: [
    ['execute', '--path', 'scripts/stablecoin-integration/create-pool-through-governance.js']
  ],
}
