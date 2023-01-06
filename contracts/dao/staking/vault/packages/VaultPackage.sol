// SPDX-License-Identifier: AGPL 3.0
// Original Copyright Aurora
// Copyright Fathom 2022

pragma solidity 0.8.13;
import "../interfaces/IVault.sol";
import "../interfaces/IVaultEvents.sol";
import "../../../tokens/ERC20/IERC20.sol";
import "../../../../common/security/AdminPausable.sol";
import "../../../../common/SafeERC20.sol";

// solhint-disable not-rely-on-time
contract VaultPackage is IVault, IVaultEvents, AdminPausable {
    using SafeERC20 for IERC20;
    bool private vaultInitialized;
    bytes32 public constant REWARDS_OPERATOR_ROLE = keccak256("REWARDS_OPERATOR_ROLE");
    mapping(address => uint256) public deposited;
    mapping(address => bool) public override isSupportedToken;
    address[] public listOfSupportedTokens;
    bool public override migrated;

    constructor() {
        _disableInitializers();
    }

    function initVault(address _admin, address[] calldata supportedTokens) external override initializer {
        require(!vaultInitialized, "Vault: Already Initialized");
        vaultInitialized = true;
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            _addSupportedToken(supportedTokens[i]);
        }
        pausableInit(0, _admin);
    }

    function addRewardsOperator(address _rewardsOperator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(REWARDS_OPERATOR_ROLE, _rewardsOperator);
    }

    function payRewards(
        address _user,
        address _token,
        uint256 _amount
    ) external override pausable(1) {
        require(hasRole(REWARDS_OPERATOR_ROLE, msg.sender), "payRewards: No role");
        require(isSupportedToken[_token], "Unsupported token");
        require(_amount != 0, "amount zero");
        require(deposited[_token] >= _amount, "payRewards: not enough deposit");
        deposited[_token] -= _amount;
        IERC20(_token).safeTransfer(_user, _amount);
    }

    function deposit(
        address _user,
        address _token,
        uint256 _amount
    ) external override pausable(1) {
        require(hasRole(REWARDS_OPERATOR_ROLE, msg.sender), "deposit: No role");
        require(isSupportedToken[_token], "Unsupported token");
        deposited[_token] += _amount;
        IERC20(_token).safeTransferFrom(_user, address(this), _amount);
    }

    /// @notice adds token as a supproted rewards token by Vault
    /// supported tokens means any future stream token should be
    /// whitelisted here
    /// @param _token stream ERC20 token address
    function addSupportedToken(address _token) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _addSupportedToken(_token);
    }

    /// @notice removed token as a supproted rewards token by Treasury
    /// @param _token stream ERC20 token address
    function removeSupportedToken(address _token) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isSupportedToken[_token], "Token does not exist");
        require(deposited[_token] == 0, "Token is still in use");
        isSupportedToken[_token] = false;
        _removeToken(_token);
        emit TokenRemoved(_token, msg.sender, block.timestamp);
    }

    /// @notice we believe newVaultPackage is safe
    function migrate(address newVaultPackage) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!migrated, "vault already migrated");
        require(paused != 0, "required pause");
        require(newVaultPackage != address(0), "withdrawTo: Zero addr");
        for (uint256 i = 0; i < listOfSupportedTokens.length; i++) {
            address token = listOfSupportedTokens[i];
            uint256 balance = IERC20(token).balanceOf(address(this));
            deposited[token] = 0;
            IERC20(token).safeApprove(newVaultPackage, balance);
            IVault(newVaultPackage).deposit(address(this), listOfSupportedTokens[i], balance);
        }
        migrated = true;
    }

    function _addSupportedToken(address _token) internal {
        require(!isSupportedToken[_token], "Token already exists");
        isSupportedToken[_token] = true;
        listOfSupportedTokens.push(_token);
        emit TokenAdded(_token, msg.sender, block.timestamp);
    }

    function _removeToken(address _token) internal {
        for (uint256 i = 0; i < listOfSupportedTokens.length; i++) {
            if (listOfSupportedTokens[i] == _token) {
                listOfSupportedTokens[i] = listOfSupportedTokens[listOfSupportedTokens.length - 1];
                break;
            }
        }
        listOfSupportedTokens.pop();
    }
}
