// SPDX-License-Identifier: MIT
// Original Copyright OpenZeppelin Contracts (last updated v4.7.0) (governance/Governor.sol)
// Copyright Fathom 2022

pragma solidity 0.8.13;

import "../../common/cryptography/ECDSA.sol";
import "../../common/cryptography/EIP712.sol";
import "../../common/introspection/ERC165.sol";
import "../../common/math/SafeCast.sol";
import "../../common/structs/DoubleEndedQueue.sol";
import "../../common/Address.sol";
import "../../common/Context.sol";
import "../../common/Strings.sol";
import "./GovernorStructs.sol";
import "./interfaces/IGovernor.sol";
import "../../common/security/Pausable.sol";

abstract contract Governor is Context, ERC165, EIP712, IGovernor, Pausable {
    using DoubleEndedQueue for DoubleEndedQueue.Bytes32Deque;
    using SafeCast for uint256;
    using Strings for *;
    using Timers for Timers.BlockNumber;

    event ConfirmProposal(address indexed signer, uint256 indexed proposalId);
    event RevokeConfirmation(address indexed signer, uint256 indexed proposalId);
    event ExecuteProposal(address indexed signer, uint256 indexed proposalId);
    event MultiSigUpdated(address newMultiSig, address oldMultiSig);
    event MaxTargetUpdated(uint256 newMaxTargets, uint256 oldMaxTargets);
    event ProposalTimeDelayUpdated(uint256 newProposalTimeDelay, uint256 oldProposalTimeDelay);

    bytes32 public constant BALLOT_TYPEHASH = keccak256("Ballot(uint256 proposalId,uint8 support)");
    bytes32 public constant EXTENDED_BALLOT_TYPEHASH = keccak256("ExtendedBallot(uint256 proposalId,uint8 support,string reason,bytes params)");
    uint256 public maxTargets;
    uint256 public proposalTimeDelay;
    string private _name;
    uint256[] private proposalIds;

    address private multiSig;

    mapping(uint256 => ProposalCore) internal _proposals;
    mapping(uint256 => string) internal _descriptions;
    mapping(uint256 => bool) public isConfirmed;
    mapping(address => uint256) public nextAcceptableProposalTimestamp;

    DoubleEndedQueue.Bytes32Deque private _governanceCall;

    modifier onlyGovernance() {
        require(_msgSender() == _executor(), "Governor: onlyGovernance");
        if (_executor() != address(this)) {
            bytes32 msgDataHash = keccak256(_msgData());
            // loop until popping the expected operation - throw if deque is empty (operation not authorized)
            while (_governanceCall.popFront() != msgDataHash) {}
        }
        _;
    }

    modifier onlyMultiSig() {
        require(_msgSender() == multiSig, "Governor: onlyMultiSig");
        _;
    }

    modifier notExecuted(uint256 _proposalId) {
        require(!_proposals[_proposalId].executed, "proposal already executed");
        _;
    }

    modifier notConfirmed(uint256 _proposalId) {
        require(!isConfirmed[_proposalId], "proposal already confirmed");
        _;
    }

    constructor(
        string memory name_,
        address multiSig_,
        uint256 maxTargets_,
        uint256 proposalTimeDelay_
    ) EIP712(name_, version()) {
        require(multiSig_ != address(0), "multiSig address cant be zero address");
        require(maxTargets_ != 0, "maxTarget cant be zero");
        require(proposalTimeDelay_ != 0, "proposalTimeDelay cant be zero");
        _name = name_;
        multiSig = multiSig_;
        maxTargets = maxTargets_;
        proposalTimeDelay = proposalTimeDelay_;
    }

    receive() external payable virtual {
        require(_executor() == address(this), "Governor, receive():  _executor() != address(this)");
    }

    function execute(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public payable virtual override whenNotPaused returns (uint256) {
        uint256 proposalId = hashProposal(targets, values, calldatas, descriptionHash);
        requireConfirmed(proposalId);

        ProposalState status = state(proposalId);
        require(status == ProposalState.Queued, "Governor: proposal not successful");
        uint256 totalValue = 0;
        for (uint256 i = 0; i < values.length; i++) {
            totalValue += values[i];
        }
        require(msg.value >= totalValue, "execute: msg.value not sufficient");
        _proposals[proposalId].executed = true;

        emit ProposalExecuted(proposalId);

        _beforeExecute(proposalId, targets, values, calldatas, descriptionHash);
        _execute(proposalId, targets, values, calldatas, descriptionHash);
        _afterExecute(proposalId, targets, values, calldatas, descriptionHash);
        if (msg.value > totalValue) {
            (bool sent, ) = msg.sender.call{ value: (msg.value - totalValue) }("");
            require(sent, "Failed to send ether");
        }
        return proposalId;
    }

    function castVote(uint256 proposalId, uint8 support) public virtual override returns (uint256) {
        address voter = _msgSender();
        return _castVote(proposalId, voter, support, "");
    }

    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string memory reason
    ) public virtual override returns (uint256) {
        address voter = _msgSender();
        return _castVote(proposalId, voter, support, reason);
    }

    function castVoteWithReasonAndParams(
        uint256 proposalId,
        uint8 support,
        string memory reason,
        bytes memory params
    ) public virtual override returns (uint256) {
        address voter = _msgSender();
        return _castVote(proposalId, voter, support, reason, params);
    }

    function castVoteBySig(
        uint256 proposalId,
        uint8 support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override returns (uint256) {
        address voter = ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(BALLOT_TYPEHASH, proposalId, support))), v, r, s);
        return _castVote(proposalId, voter, support, "");
    }

    function castVoteWithReasonAndParamsBySig(
        uint256 proposalId,
        uint8 support,
        string memory reason,
        bytes memory params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override returns (uint256) {
        address voter = ECDSA.recover(
            _hashTypedDataV4(keccak256(abi.encode(EXTENDED_BALLOT_TYPEHASH, proposalId, support, keccak256(bytes(reason)), keccak256(params)))),
            v,
            r,
            s
        );

        return _castVote(proposalId, voter, support, reason, params);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public virtual override whenNotPaused returns (uint256) {
        require(getVotes(_msgSender(), block.number - 1) >= proposalThreshold(), "Governor: proposer votes below proposal threshold");

        require(block.timestamp > nextAcceptableProposalTimestamp[msg.sender], "Governor: Can only submit one proposal for a certain interval");

        nextAcceptableProposalTimestamp[msg.sender] = block.timestamp + proposalTimeDelay;

        uint256 proposalId = hashProposal(targets, values, calldatas, keccak256(bytes(description)));

        require(targets.length == values.length, "Governor: invalid proposal length");
        require(targets.length == calldatas.length, "Governor: invalid proposal length");
        require(targets.length > 0, "Governor: empty proposal");
        require(targets.length <= maxTargets, "Governor: max target length");

        ProposalCore storage proposal = _proposals[proposalId];
        require(proposal.voteStart.isUnset(), "Governor: proposal already exists");

        uint64 snapshot = block.number.toUint64() + votingDelay().toUint64();
        uint64 deadline = snapshot + votingPeriod().toUint64();

        proposal.voteStart.setDeadline(snapshot);
        proposal.voteEnd.setDeadline(deadline);
        _descriptions[proposalId] = description;

        proposalIds.push(proposalId);

        emit ProposalCreated(proposalId, _msgSender(), targets, values, new string[](targets.length), calldatas, snapshot, deadline, description);

        return proposalId;
    }

    function confirmProposal(uint256 _proposalId) public onlyMultiSig notExecuted(_proposalId) notConfirmed(_proposalId) {
        isConfirmed[_proposalId] = true;
        ProposalState status = state(_proposalId);
        require(status == ProposalState.Succeeded || status == ProposalState.Queued, "Governor: proposal not successful");
        emit ConfirmProposal(msg.sender, _proposalId);
    }

    function revokeConfirmation(uint256 _proposalId) public onlyMultiSig notExecuted(_proposalId) {
        requireConfirmed(_proposalId);

        isConfirmed[_proposalId] = false;

        emit RevokeConfirmation(msg.sender, _proposalId);
    }

    function updateMultiSig(address newMultiSig) public onlyMultiSig {
        require(newMultiSig != address(0), "updateMultiSig: newMultiSig cant be set to zero address");
        emit MultiSigUpdated(newMultiSig, multiSig);
        multiSig = newMultiSig;
    }

    function updateMaxTargets(uint256 newMaxTargets) public onlyMultiSig {
        require(newMaxTargets != 0, "updateMaxTargets: newMaxTargets cant be zero");
        emit MaxTargetUpdated(newMaxTargets, maxTargets);
        maxTargets = newMaxTargets;
    }

    function updateProposalTimeDelay(uint256 newProposalTimeDelay) public onlyMultiSig {
        require(newProposalTimeDelay != 0, "updateProposalTimeDelay: newProposalTimeDelay cant be zero");
        emit ProposalTimeDelayUpdated(newProposalTimeDelay, proposalTimeDelay);
        proposalTimeDelay = newProposalTimeDelay;
    }

    function emergencyStop() public onlyMultiSig {
        _pause();
    }

    function unpause() public onlyMultiSig {
        _unpause();
    }

    function getProposals(uint256 _numIndexes)
        public
        view
        override
        returns (
            string[] memory,
            string[] memory,
            string[] memory
        )
    {
        uint256 len = proposalIds.length;

        if (len == 0) {
            string[] memory a;
            string[] memory b;
            string[] memory c;
            return (a, b, c);
        } else if (_numIndexes > len) {
            _numIndexes = len;
        }

        return _getProposals1(_numIndexes);
    }

    function _getProposals1(uint256 _numIndexes)
        internal
        view
        returns (
            string[] memory,
            string[] memory,
            string[] memory
        )
    {
        string[] memory _statusses = new string[](_numIndexes);
        string[] memory _descriptionsArray = new string[](_numIndexes);
        string[] memory _proposalIds = new string[](_numIndexes);

        uint256 counter = proposalIds.length;

        uint256 indexCounter = _numIndexes - 1;

        if (_numIndexes >= counter) {
            indexCounter = counter - 1;
        }

        while (indexCounter >= 0) {
            uint256 _currentPropId = proposalIds[counter - 1];
            _proposalIds[indexCounter] = string(_currentPropId.toString());
            _descriptionsArray[indexCounter] = _descriptions[_currentPropId];
            _statusses[indexCounter] = (uint8(state(_currentPropId))).toString();

            if (counter - 1 == 0) {
                break;
            }
            if (indexCounter == 0) {
                break;
            }

            counter--;
            indexCounter--;
        }

        return (_proposalIds, _descriptionsArray, _statusses);
    }

    function getProposalIds() public view override returns (uint256[] memory) {
        return proposalIds;
    }

    function getDescription(uint256 _proposalId) public view override returns (string memory) {
        return _descriptions[_proposalId];
    }

    function getVotes(address account, uint256 blockNumber) public view virtual override returns (uint256) {
        return _getVotes(account, blockNumber, _defaultParams());
    }

    function getVotesWithParams(
        address account,
        uint256 blockNumber,
        bytes memory params
    ) public view virtual override returns (uint256) {
        return _getVotes(account, blockNumber, params);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC165) returns (bool) {
        return
            interfaceId ==
            (type(IGovernor).interfaceId ^
                this.castVoteWithReasonAndParams.selector ^
                this.castVoteWithReasonAndParamsBySig.selector ^
                this.getVotesWithParams.selector) ||
            interfaceId == type(IGovernor).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function version() public view virtual override returns (string memory) {
        return "1";
    }

    function state(uint256 proposalId) public view virtual override returns (ProposalState) {
        ProposalCore storage proposal = _proposals[proposalId];

        if (proposal.executed) {
            return ProposalState.Executed;
        }

        if (proposal.canceled) {
            return ProposalState.Canceled;
        }

        uint256 snapshot = proposalSnapshot(proposalId);

        if (snapshot == 0) {
            revert("Governor: unknown proposal id");
        }

        if (snapshot >= block.number) {
            return ProposalState.Pending;
        }

        uint256 deadline = proposalDeadline(proposalId);

        if (deadline >= block.number) {
            return ProposalState.Active;
        }

        if (_quorumReached(proposalId) && _voteSucceeded(proposalId)) {
            return ProposalState.Succeeded;
        } else {
            return ProposalState.Defeated;
        }
    }

    function proposalSnapshot(uint256 proposalId) public view virtual override returns (uint256) {
        return _proposals[proposalId].voteStart.getDeadline();
    }

    function proposalDeadline(uint256 proposalId) public view virtual override returns (uint256) {
        return _proposals[proposalId].voteEnd.getDeadline();
    }

    function proposalThreshold() public view virtual returns (uint256) {
        return 0;
    }

    function hashProposal(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public pure virtual override returns (uint256) {
        return uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)));
    }

    function _countVote(
        uint256 proposalId,
        address account,
        uint8 support,
        uint256 weight,
        bytes memory params
    ) internal virtual;

    function _execute(
        uint256, /*proposalId*/
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 /*descriptionHash*/
    ) internal virtual {
        string memory errorMessage = "Governor: call reverted without message";
        for (uint256 i = 0; i < targets.length; ++i) {
            (bool success, bytes memory returndata) = targets[i].call{ value: values[i] }(calldatas[i]);
            Address.verifyCallResult(success, returndata, errorMessage);
        }
    }

    function _beforeExecute(
        uint256, /* proposalId */
        address[] memory targets,
        uint256[] memory, /* values */
        bytes[] memory calldatas,
        bytes32 /*descriptionHash*/
    ) internal virtual {
        if (_executor() != address(this)) {
            for (uint256 i = 0; i < targets.length; ++i) {
                if (targets[i] == address(this)) {
                    _governanceCall.pushBack(keccak256(calldatas[i]));
                }
            }
        }
    }

    function _afterExecute(
        uint256, /* proposalId */
        address[] memory, /* targets */
        uint256[] memory, /* values */
        bytes[] memory, /* calldatas */
        bytes32 /*descriptionHash*/
    ) internal virtual {
        if (_executor() != address(this)) {
            if (!_governanceCall.empty()) {
                _governanceCall.clear();
            }
        }
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal virtual returns (uint256) {
        uint256 proposalId = hashProposal(targets, values, calldatas, descriptionHash);
        ProposalState status = state(proposalId);

        require(
            status != ProposalState.Canceled && status != ProposalState.Expired && status != ProposalState.Executed,
            "Governor: proposal not active"
        );
        _proposals[proposalId].canceled = true;

        emit ProposalCanceled(proposalId);

        return proposalId;
    }

    function _castVote(
        uint256 proposalId,
        address account,
        uint8 support,
        string memory reason
    ) internal virtual returns (uint256) {
        return _castVote(proposalId, account, support, reason, _defaultParams());
    }

    function _castVote(
        uint256 proposalId,
        address account,
        uint8 support,
        string memory reason,
        bytes memory params
    ) internal virtual returns (uint256) {
        ProposalCore storage proposal = _proposals[proposalId];
        require(state(proposalId) == ProposalState.Active, "Governor: vote not currently active");

        uint256 weight = _getVotes(account, proposal.voteStart.getDeadline(), params);
        _countVote(proposalId, account, support, weight, params);

        if (params.length == 0) {
            emit VoteCast(account, proposalId, support, weight, reason);
        } else {
            emit VoteCastWithParams(account, proposalId, support, weight, reason, params);
        }

        return weight;
    }

    function _getProposalsAll(uint256 len)
        internal
        view
        returns (
            string[] memory,
            string[] memory,
            string[] memory
        )
    {
        string[] memory _statusses = new string[](len);
        string[] memory _descriptionsArray = new string[](len);
        string[] memory _proposalIds = new string[](len);

        uint256 i = len - 1;
        while (i >= 0) {
            uint256 _proposalId = proposalIds[i];
            _proposalIds[i] = _proposalId.toString();
            _descriptionsArray[i] = _descriptions[_proposalId];
            _statusses[i] = (uint8(state(_proposalId))).toString();

            if (i == 0) {
                break;
            }
            i--;
        }

        return (_proposalIds, _descriptionsArray, _statusses);
    }

    function _getProposals(uint256 _numIndexes, uint256 len)
        internal
        view
        returns (
            string[] memory,
            string[] memory,
            string[] memory
        )
    {
        string[] memory _statusses = new string[](_numIndexes);
        string[] memory _descriptionsArray = new string[](_numIndexes);
        string[] memory _proposalIds = new string[](_numIndexes);

        // uint _lb = len - _numIndexes;
        uint256 i = _numIndexes;

        while (i > 0) {
            uint256 _proposalId = proposalIds[len - 1 - i];
            _proposalIds[i - 1] = _proposalId.toString();
            _descriptionsArray[i - 1] = _descriptions[_proposalId];
            _statusses[i - 1] = (uint8(state(_proposalId))).toString();

            if (i == 0) {
                break;
            }
            i--;
        }

        return (_proposalIds, _descriptionsArray, _statusses);
    }

    function requireConfirmed(uint256 _proposalId) internal view {
        require(isConfirmed[_proposalId], "proposal not confirmed");
    }

    function _executor() internal view virtual returns (address) {
        return address(this);
    }

    function _quorumReached(uint256 proposalId) internal view virtual returns (bool);

    function _voteSucceeded(uint256 proposalId) internal view virtual returns (bool);

    function _getVotes(
        address account,
        uint256 blockNumber,
        bytes memory params
    ) internal view virtual returns (uint256);

    function _defaultParams() internal view virtual returns (bytes memory) {
        return "";
    }
}
