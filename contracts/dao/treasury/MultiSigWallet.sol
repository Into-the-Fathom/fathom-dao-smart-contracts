// SPDX-License-Identifier: MIT
// Copyright Fathom 2022

pragma solidity 0.8.13;

import "./interfaces/IMultiSigWallet.sol";
import "../../common/Address.sol";

contract MultiSigWallet is IMultiSigWallet {
    using Address for address;

    struct Transaction {
        address to;
        bool executed;
        bytes data;
        uint256 value;
        uint256 numConfirmations;
        uint256 expireTimestamp;
    }

    error TransactionRevered(bytes data);

    uint256 public constant MAX_OWNER_COUNT = 50;

    address[] public owners;
    address public governor;

    uint256 public numConfirmationsRequired;
    uint256 public lastDisabledTransactionIndex;

    mapping(address => bool) public isOwner;
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    mapping(address => bytes32) internal whitelistedBytesCode;

    Transaction[] public transactions;

    modifier onlyOwnerOrGov() {
        require(isOwner[msg.sender] || governor == msg.sender, "MultiSig: MultiSigWallet, onlyOwnerOrGov(): Neither owner nor governor");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "MultiSig: tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "MultiSig: tx already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "MultiSig: tx already confirmed");
        _;
    }

    modifier notDisabled(uint256 _txIndex) {
        require(_txIndex >= lastDisabledTransactionIndex, "MultiSig: old txs has been disabled");
        _;
    }

    modifier notExpired(uint256 _txIndex) {
        require(transactions[_txIndex].expireTimestamp >= block.timestamp || transactions[_txIndex].expireTimestamp == 0, "MultiSig: tx expired");
        _;
    }

    modifier onlyWallet() {
        require(msg.sender == address(this), "MultiSig: Only this wallet can use this funciton");
        _;
    }

    modifier validRequirement(uint256 ownerCount, uint256 _required) {
        require(
            ownerCount > 0 && ownerCount <= MAX_OWNER_COUNT && _required <= ownerCount && ownerCount > 1 ? _required > 1 : _required > 0,
            "MultiSig: Invalid requirement"
        );
        _;
    }

    modifier ownerExists(address owner) {
        require(isOwner[owner], "MultiSig: !isOwner[owner]");
        _;
    }

    modifier validateSubmitTxInputs(
        address _to,
        uint256 _value,
        bytes memory _data,
        uint256 _expireTimestamp
    ) {
        require(_expireTimestamp >= block.timestamp || _expireTimestamp == 0, "already expired");

        if (_to.isContract()) {
            require(_data.length > 0, "no calldata for contract call");
        } else {
            require(_data.length == 0 && _value > 0, "calldata for EOA call or 0 value");
        }

        require(address(this).balance >= _value, "not enough balance");

        _;
    }

    constructor(
        address[] memory _owners,
        uint256 _numConfirmationsRequired,
        address _governor
    ) {
        governor = _governor;
        require(_owners.length <= MAX_OWNER_COUNT, "owners limit reached");
        require(_owners.length > 0, "owners required");
        require(_numConfirmationsRequired > 0 && _numConfirmationsRequired <= _owners.length, "invalid number of required confirmations");

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }

    receive() external payable override {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function removeOwner(address owner) public override onlyWallet ownerExists(owner) {
        isOwner[owner] = false;
        for (uint256 i = 0; i < owners.length - 1; i++)
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                break;
            }
        owners.pop();

        if (numConfirmationsRequired > owners.length) changeRequirement(owners.length);

        lastDisabledTransactionIndex = getTransactionCount();

        emit OwnerRemoval(owner);
    }

    function addOwners(address[] memory _owners)
        public
        override
        onlyWallet
        validRequirement(owners.length + _owners.length, numConfirmationsRequired + _owners.length)
    {
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "MultiSig: owner address == 0");
            _requireNewOwner(owner);

            isOwner[owner] = true;
            owners.push(owner);
            emit OwnerAddition(owner);
        }

        changeRequirement(numConfirmationsRequired + _owners.length);
    }

    function changeRequirement(uint256 _required) public override onlyWallet validRequirement(owners.length, _required) {
        numConfirmationsRequired = _required;
        emit RequirementChange(_required);
    }

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data,
        uint256 _expireTimestamp
    ) public override onlyOwnerOrGov validateSubmitTxInputs(_to, _value, _data, _expireTimestamp) {
        require(address(this).balance >= _value, "submitTransaction: not enough balance");
        if (!_to.isContract()) {
            require(_value != 0, "submitTransaction: value is zero");
            require(_data.length > 0, "submitTransaction: not equal");
        }
        uint256 txIndex = transactions.length;

        transactions.push(
            Transaction({ to: _to, value: _value, data: _data, executed: false, numConfirmations: 0, expireTimestamp: _expireTimestamp })
        );

        whitelistedBytesCode[_to] = _to.getExtCodeHash();

        emit SubmitTransaction(txIndex, msg.sender, _to, _value, _data);
    }

    function confirmTransaction(uint256 _txIndex)
        public
        override
        onlyOwnerOrGov
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
        notDisabled(_txIndex)
        notExpired(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        _requireTargetCodeNotChanged(transaction.to);

        transaction.numConfirmations += 1;
        isConfirmed[_txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    function executeTransaction(uint256 _txIndex)
        public
        override
        onlyOwnerOrGov
        txExists(_txIndex)
        notExecuted(_txIndex)
        notDisabled(_txIndex)
        notExpired(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        _requireTargetCodeNotChanged(transaction.to);

        require(transaction.numConfirmations >= numConfirmationsRequired, "cannot execute tx");

        transaction.executed = true;

        (bool success, bytes memory data) = transaction.to.call{ value: transaction.value }(transaction.data);
        if (success) {
            emit ExecuteTransaction(msg.sender, _txIndex);
        } else {
            revert TransactionRevered(data);
        }

        emit ExecuteTransaction(msg.sender, _txIndex);
    }

    function revokeConfirmation(uint256 _txIndex)
        public
        override
        onlyOwnerOrGov
        txExists(_txIndex)
        notExecuted(_txIndex)
        notDisabled(_txIndex)
        notExpired(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        require(isConfirmed[_txIndex][msg.sender], "tx not confirmed");

        transaction.numConfirmations -= 1;
        isConfirmed[_txIndex][msg.sender] = false;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    function getOwners() public view override returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view override returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 _txIndex)
        public
        view
        override
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations,
            uint256 expireTimestamp
        )
    {
        Transaction memory transaction = transactions[_txIndex];

        return (transaction.to, transaction.value, transaction.data, transaction.executed, transaction.numConfirmations, transaction.expireTimestamp);
    }

    function _requireNewOwner(address owner) internal view {
        require(!isOwner[owner], "MultiSig: Owner already exists");
    }

    function _requireTargetCodeNotChanged(address target) internal view {
        require(whitelistedBytesCode[target] == target.getExtCodeHash(), "target code changed");
    }
}
