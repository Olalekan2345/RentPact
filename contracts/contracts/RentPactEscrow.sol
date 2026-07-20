// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal interface onto TenancyCredential — avoids a circular import
/// between the two contracts (see the `credentialContract` NatSpec below for
/// why this is set post-deploy rather than being immutable).
interface ITenancyCredential {
    struct CredentialData {
        uint256 leaseId;
        uint256 durationDays;
        uint256 totalPeriods;
        uint256 onTimePeriods;
        uint256 disputesLost;
        uint256 completionDate;
    }

    function mintForLease(address tenant, CredentialData calldata data) external returns (uint256);
}

/// @title RentPactEscrow
/// @notice USDC rent escrow: a tenant deposits the full lease amount up front, the
/// landlord countersigns, and funds release to the landlord tranche-by-tranche on a
/// monthly, quarterly, or yearly schedule. The tenant can freeze releases by raising a
/// dispute. A dispute first opens a 7-day direct-settlement window where either party
/// can propose a split of the remaining escrow for the other to accept; if no
/// settlement is reached, a single arbiter rules on a split; if the arbiter doesn't
/// rule within 5 days of the settlement window closing, the dispute auto-resolves in
/// the landlord's favor so funds can never freeze indefinitely on human inaction.
/// A lease may optionally include a caution fee (security deposit), held in this same
/// escrow separate from rent tranches (Article 1.6). It releases to the tenant
/// automatically 7 days after the lease completes unless the landlord files an
/// itemized damage claim within that window; a partial claim releases the undisputed
/// remainder immediately, and only the claimed amount goes through the same
/// settlement/arbitration/auto-fallback path a rent dispute uses (Article 6.5–6.7).
/// When a lease's rent side completes naturally (every tranche released via
/// `releaseTranche`, never forced complete by a dispute resolution) AND any caution
/// fee has fully settled, this contract mints the tenant a soulbound
/// TenancyCredential — see `_tryMintCredential` for the exact, contract-enforced
/// eligibility rule.
/// @dev Production path: `arbiter` is a single trusted address for this version. A
/// production deployment should replace the arbiter with a panel — e.g. a Safe multisig
/// or a small DAO-governed resolver contract that implements the same `onlyArbiter`
/// call surface (`resolveDispute`) behind a voting or threshold-signature scheme.
/// This deployment records `constitutionHash` — the hash of the RentPact Constitution
/// version this contract enforces (see Article VIII.4) — as an immutable constant set
/// at deploy time. Every lease created under this contract is bound to that version.
contract RentPactEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Release cadence for a lease's rent tranches.
    /// @dev Daily and Hourly appended at the end (never reordered — the enum's
    /// integer value is stored on-chain per lease and encoded in ABI-decoded
    /// events). Short-term leases deliberately use the same fixed SIGN_DEADLINE,
    /// SETTLEMENT_WINDOW, ARBITRATION_WINDOW, and CAUTION_CLAIM_WINDOW as
    /// month-long leases — a known, accepted mismatch (a dispute on a 3-day
    /// stay outlives the stay itself) rather than variable per-lease windows,
    /// which was a larger redesign than this feature warranted. See product notes.
    enum Frequency {
        Monthly,
        Quarterly,
        Yearly,
        Daily,
        Hourly
    }

    /// @notice How a dispute was concluded — kept on the resolution event for the
    /// evidence trail (Constitution Article 4.4: "every ruling must include written
    /// reasoning" — the reasoning itself lives off-chain in the app's message record;
    /// this flags which path produced the ruling).
    enum ResolutionType {
        Settlement,
        Arbitration,
        AutoFallback
    }

    struct Lease {
        address tenant;
        address landlord;
        uint256 amountPerPeriod;
        uint256 totalPeriods;
        uint256 periodsReleased;
        Frequency frequency;
        uint256 createdAt;
        uint256 signedAt;
        bool signed;
        bool cancelled;
        bool disputeActive;
        uint256 disputeRaisedAt;
        string disputeReason;
        // Tier 1 direct settlement (Constitution Article 4.3) — the currently pending
        // proposal, if any. settlementProposer == address(0) means no open proposal.
        uint16 settlementProposedBps;
        address settlementProposer;
        // Repair-credit remedy (Constitution Article 4.6) — a landlord-funded side
        // payment that resolves a dispute WITHOUT touching escrow, so the release
        // schedule resumes normally. Non-zero means the landlord has offered (and this
        // contract is holding) that many token base units, awaiting the tenant's
        // acceptance. Held funds are commingled in this contract's balance but tracked
        // per-lease here and only ever paid to the tenant (accept) or back to the
        // landlord (withdraw / auto-refund on any other resolution) — every escrow
        // payout is computed from lease fields, never from token.balanceOf, so this
        // never affects any other lease's accounting.
        uint256 repairCreditHeld;
        // true while the currently active dispute is over a caution claim rather than
        // rent tranches — tells _finalizeDispute which pool of funds to split.
        bool disputeIsCautionClaim;
        // Caution fee (Article 1.6, 6.5–6.7) — 0 means this lease has none.
        uint256 cautionAmount;
        // block.timestamp the lease finished releasing all rent tranches; 0 until then.
        // Anchors the 7-day caution claim window (Article 6.5).
        uint256 completedAt;
        // 0 means no claim has been filed. A claim can only be filed once.
        uint256 cautionClaimedAmount;
        bytes32 cautionClaimEvidenceHash;
        uint256 cautionClaimFiledAt;
        // true once no further action can occur on the caution fee — auto-released in
        // full, or its claimed portion has been resolved.
        bool cautionSettled;
        // true only if periodsReleased reached totalPeriods via ordinary releaseTranche
        // calls — never set by _finalizeDispute. The tenancy-credential gate.
        bool completedNaturally;
        // Periods released as part of a multi-period catch-up beyond the first are
        // counted late; onTimePeriods = totalPeriods - latePeriods on the credential.
        uint256 latePeriods;
        // Rent or caution-claim disputes resolved at landlordBps >= 50% — an outcome
        // fact surfaced on the credential, not a disqualifier by itself.
        uint256 disputesLostCount;
        // 0 until a credential has been minted for this lease.
        uint256 credentialTokenId;
    }

    /// @notice Window the landlord has to countersign before the tenant can reclaim funds. Article 1.5.
    uint256 public constant SIGN_DEADLINE = 7 days;

    /// @notice Direct-settlement window after a dispute is raised. Article 4.3.
    uint256 public constant SETTLEMENT_WINDOW = 7 days;

    /// @notice How long the arbiter has, after the settlement window closes, before a
    /// dispute auto-resolves to the landlord. Article 4.4 + the auto-fallback this
    /// contract adds so a non-responsive arbiter can never freeze funds indefinitely.
    uint256 public constant ARBITRATION_WINDOW = 5 days;

    /// @notice Basis-points denominator — a split is expressed as landlordBps / 10_000.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Window the landlord has, after lease completion, to file a caution fee
    /// damage claim before it auto-releases to the tenant. Article 6.5.
    uint256 public constant CAUTION_CLAIM_WINDOW = 7 days;

    /// @notice USDC (or any ERC-20) token held in escrow.
    IERC20 public immutable token;

    /// @notice Single arbiter authorized to resolve disputes. See contract-level NatSpec
    /// for the production path to a multi-party panel.
    address public immutable arbiter;

    /// @notice SHA-256 hash of the RentPact Constitution version this deployment
    /// enforces. Every lease created under this contract is bound to this version —
    /// amendments require a new Constitution hash and a new contract deployment
    /// (Article VIII.2: "Amendments never apply retroactively to active leases.").
    bytes32 public immutable constitutionHash;

    /// @notice Address that deployed this contract — the only address allowed to call
    /// `setCredentialContract` once. Not an ongoing admin role; it has no other power.
    address public immutable deployer;

    /// @notice TenancyCredential contract, mintable to on full natural lease
    /// completion. Not `immutable`: TenancyCredential's constructor needs this
    /// contract's address, so this contract can't know TenancyCredential's address
    /// until after both are deployed. Settable exactly once, by `deployer` only,
    /// then permanently locked — immutable in effect, not in keyword.
    address public credentialContract;

    uint256 private nextLeaseId = 1;

    mapping(uint256 => Lease) private leases;

    event LeaseCreated(
        uint256 indexed leaseId,
        address indexed tenant,
        address indexed landlord,
        uint256 amountPerPeriod,
        uint256 totalPeriods,
        Frequency frequency,
        uint256 rentDeposited,
        uint256 cautionAmount
    );
    event LeaseSigned(uint256 indexed leaseId, uint256 signedAt);
    event TrancheReleased(
        uint256 indexed leaseId,
        uint256 periodsReleased,
        uint256 amountReleased,
        uint256 totalPeriodsReleased
    );
    event LeaseCompleted(uint256 indexed leaseId);
    event DisputeRaised(uint256 indexed leaseId, address indexed tenant, string reason);
    event SettlementProposed(uint256 indexed leaseId, address indexed proposer, uint16 landlordBps);
    event RepairCreditOffered(uint256 indexed leaseId, uint256 amount);
    event RepairCreditAccepted(uint256 indexed leaseId, uint256 amount);
    event RepairCreditWithdrawn(uint256 indexed leaseId, uint256 amount);
    event DisputeResolved(
        uint256 indexed leaseId,
        uint16 landlordBps,
        uint256 releasedToLandlord,
        uint256 refundedToTenant,
        ResolutionType resolutionType
    );
    event LeaseCancelled(uint256 indexed leaseId, uint256 refundedAmount);
    event DepositClaimFiled(uint256 indexed leaseId, uint256 claimAmount, bytes32 evidenceHash, uint256 remainderReleased);
    event CautionReleased(uint256 indexed leaseId, uint256 amount);
    event CautionClaimResolved(
        uint256 indexed leaseId,
        uint16 landlordBps,
        uint256 releasedToLandlord,
        uint256 refundedToTenant,
        ResolutionType resolutionType
    );

    error ZeroAddress();
    error InvalidAmount();
    error InvalidPeriods();
    error LeaseNotFound();
    error NotLandlord();
    error NotTenant();
    error NotArbiter();
    error NotParty();
    error AlreadySigned();
    error AlreadyCancelled();
    error SignDeadlinePassed();
    error SignDeadlineNotPassed();
    error DisputeAlreadyActive();
    error DisputeActive();
    error DisputeNotActive();
    error LeaseNotSigned();
    error LeaseFullyReleased();
    error NoPeriodsElapsed();
    error InvalidBps();
    error SettlementWindowClosed();
    error SettlementWindowNotClosed();
    error NoSettlementProposal();
    error CannotAcceptOwnProposal();
    error NoRepairCreditOffer();
    error RepairCreditOnCautionClaim();
    error InvalidCreditAmount();
    error ArbitrationWindowNotElapsed();
    error NoCautionFee();
    error LeaseNotComplete();
    error ClaimAlreadyFiled();
    error ClaimWindowClosed();
    error ClaimWindowNotElapsed();
    error InvalidClaimAmount();
    error NoEvidence();
    error CautionAlreadySettled();
    error NotDeployer();
    error CredentialContractAlreadySet();

    modifier leaseExists(uint256 leaseId) {
        if (leases[leaseId].tenant == address(0)) revert LeaseNotFound();
        _;
    }

    constructor(address token_, address arbiter_, bytes32 constitutionHash_) {
        if (token_ == address(0) || arbiter_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        arbiter = arbiter_;
        constitutionHash = constitutionHash_;
        deployer = msg.sender;
    }

    /// @notice One-time wiring of the TenancyCredential deployed against this
    /// contract's address. Must be called once, by `deployer`, right after both
    /// contracts are deployed — see contracts/scripts/deploy.ts. Permanently
    /// reverts on any call after the first.
    function setCredentialContract(address credentialContract_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (credentialContract != address(0)) revert CredentialContractAlreadySet();
        if (credentialContract_ == address(0)) revert ZeroAddress();
        credentialContract = credentialContract_;
    }

    /// @notice Deposits `amountPerPeriod * periods + cautionAmount` USDC into escrow and
    /// creates a new lease awaiting the landlord's signature.
    /// @param landlord Address that will receive released tranches once signed.
    /// @param amountPerPeriod USDC amount (token base units) released per period.
    /// @param periods Total number of release periods over the lease term.
    /// @param frequency Release cadence — monthly, quarterly, or yearly.
    /// @param cautionAmount Optional caution fee (Article 1.6), in token base units. 0 for none.
    /// @return leaseId Identifier of the newly created lease.
    function createLease(
        address landlord,
        uint256 amountPerPeriod,
        uint256 periods,
        Frequency frequency,
        uint256 cautionAmount
    ) external nonReentrant returns (uint256 leaseId) {
        if (landlord == address(0)) revert ZeroAddress();
        if (amountPerPeriod == 0) revert InvalidAmount();
        if (periods == 0) revert InvalidPeriods();

        uint256 rentTotal = amountPerPeriod * periods;
        uint256 totalDeposit = rentTotal + cautionAmount;

        leaseId = nextLeaseId++;
        Lease storage lease = leases[leaseId];
        lease.tenant = msg.sender;
        lease.landlord = landlord;
        lease.amountPerPeriod = amountPerPeriod;
        lease.totalPeriods = periods;
        lease.frequency = frequency;
        lease.createdAt = block.timestamp;
        lease.cautionAmount = cautionAmount;

        token.safeTransferFrom(msg.sender, address(this), totalDeposit);

        emit LeaseCreated(
            leaseId,
            msg.sender,
            landlord,
            amountPerPeriod,
            periods,
            frequency,
            rentTotal,
            cautionAmount
        );
    }

    /// @notice Landlord countersigns the lease, starting the release schedule.
    /// @dev Must be called within `SIGN_DEADLINE` of creation or the tenant may cancel
    /// via `cancelUnsigned` for a full refund.
    function signLease(uint256 leaseId) external leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (lease.cancelled) revert AlreadyCancelled();
        if (lease.signed) revert AlreadySigned();
        if (msg.sender != lease.landlord) revert NotLandlord();
        if (block.timestamp > lease.createdAt + SIGN_DEADLINE) revert SignDeadlinePassed();

        lease.signed = true;
        lease.signedAt = block.timestamp;

        emit LeaseSigned(leaseId, block.timestamp);
    }

    /// @notice Releases all elapsed, unreleased tranches to the landlord in one call.
    /// @dev Permissionless — anyone may trigger a release once the interval has elapsed.
    /// Reverts if a dispute is active, the lease isn't signed, or no new period has elapsed.
    function releaseTranche(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (!lease.signed) revert LeaseNotSigned();
        if (lease.disputeActive) revert DisputeActive();
        if (lease.periodsReleased >= lease.totalPeriods) revert LeaseFullyReleased();

        uint256 elapsedPeriods = (block.timestamp - lease.signedAt) / intervalSeconds(lease.frequency);
        if (elapsedPeriods > lease.totalPeriods) {
            elapsedPeriods = lease.totalPeriods;
        }

        uint256 periodsDue = elapsedPeriods - lease.periodsReleased;
        if (periodsDue == 0) revert NoPeriodsElapsed();

        uint256 amount = periodsDue * lease.amountPerPeriod;
        lease.periodsReleased += periodsDue;
        if (periodsDue > 1) {
            lease.latePeriods += periodsDue - 1;
        }

        token.safeTransfer(lease.landlord, amount);

        emit TrancheReleased(leaseId, periodsDue, amount, lease.periodsReleased);

        if (lease.periodsReleased == lease.totalPeriods) {
            lease.completedAt = block.timestamp;
            lease.completedNaturally = true;
            emit LeaseCompleted(leaseId);
            _tryMintCredential(leaseId, lease);
        }
    }

    /// @notice Tenant freezes all future releases pending settlement or arbiter review.
    /// @param reason Free-text description of the breach, stored on-chain for the record.
    function raiseDispute(uint256 leaseId, string calldata reason) external leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (msg.sender != lease.tenant) revert NotTenant();
        if (!lease.signed) revert LeaseNotSigned();
        if (lease.disputeActive) revert DisputeAlreadyActive();
        if (lease.periodsReleased >= lease.totalPeriods) revert LeaseFullyReleased();

        lease.disputeActive = true;
        lease.disputeRaisedAt = block.timestamp;
        lease.disputeReason = reason;
        lease.settlementProposer = address(0);
        lease.settlementProposedBps = 0;

        emit DisputeRaised(leaseId, msg.sender, reason);
    }

    /// @notice Tier 1 — either party proposes a split of the remaining escrow while the
    /// 7-day settlement window is open. A later call from the same or the other party
    /// replaces any prior unaccepted proposal. Article 4.3.
    /// @param landlordBps Share of the remaining escrow going to the landlord, in basis
    /// points (10_000 = 100%). The rest refunds to the tenant.
    function proposeSettlement(uint256 leaseId, uint16 landlordBps) external leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (!lease.disputeActive) revert DisputeNotActive();
        if (msg.sender != lease.tenant && msg.sender != lease.landlord) revert NotParty();
        if (landlordBps > BPS_DENOMINATOR) revert InvalidBps();
        if (block.timestamp > lease.disputeRaisedAt + SETTLEMENT_WINDOW) revert SettlementWindowClosed();

        lease.settlementProposer = msg.sender;
        lease.settlementProposedBps = landlordBps;

        emit SettlementProposed(leaseId, msg.sender, landlordBps);
    }

    /// @notice Tier 1 — the party who did not propose accepts the pending settlement,
    /// executing the split immediately. Article 4.3.
    function acceptSettlement(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (!lease.disputeActive) revert DisputeNotActive();
        if (msg.sender != lease.tenant && msg.sender != lease.landlord) revert NotParty();
        if (lease.settlementProposer == address(0)) revert NoSettlementProposal();
        if (msg.sender == lease.settlementProposer) revert CannotAcceptOwnProposal();
        if (block.timestamp > lease.disputeRaisedAt + SETTLEMENT_WINDOW) revert SettlementWindowClosed();

        uint16 landlordBps = lease.settlementProposedBps;
        _finalizeDispute(leaseId, lease, landlordBps, ResolutionType.Settlement);
    }

    /// @notice Repair-credit remedy (Article 4.6) — the landlord offers to pay the tenant
    /// a fixed credit (e.g. reimbursing a repair the tenant handled) to resolve the
    /// dispute WITHOUT dividing escrow, so the lease continues on its normal schedule.
    /// The offered amount is pulled from the landlord's wallet into this contract and
    /// held until the tenant accepts (funds go to the tenant), the landlord withdraws
    /// it, or the dispute resolves another way (auto-refunded to the landlord in
    /// `_finalizeDispute`). Requires the landlord to have approved this contract for
    /// `creditAmount` first, exactly like a tenant's deposit approval.
    /// @dev Landlord-only and, unlike a settlement, one-directional: the party paying is
    /// always the landlord, so there is no "accept your own offer" case to guard.
    /// @param creditAmount Credit to pay the tenant, in token base units. Must be > 0.
    function offerRepairCredit(uint256 leaseId, uint256 creditAmount) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (msg.sender != lease.landlord) revert NotLandlord();
        if (!lease.disputeActive) revert DisputeNotActive();
        if (lease.disputeIsCautionClaim) revert RepairCreditOnCautionClaim();
        if (creditAmount == 0) revert InvalidCreditAmount();
        if (block.timestamp > lease.disputeRaisedAt + SETTLEMENT_WINDOW) revert SettlementWindowClosed();

        // Replace semantics, mirroring proposeSettlement: a new offer supersedes any
        // prior unaccepted one. Return the previously held amount before holding the new.
        uint256 previouslyHeld = lease.repairCreditHeld;
        lease.repairCreditHeld = creditAmount;
        if (previouslyHeld > 0) token.safeTransfer(lease.landlord, previouslyHeld);
        token.safeTransferFrom(lease.landlord, address(this), creditAmount);

        emit RepairCreditOffered(leaseId, creditAmount);
    }

    /// @notice Repair-credit remedy (Article 4.6) — the tenant accepts the landlord's
    /// held credit. The credit transfers to the tenant, the dispute clears, and the
    /// release schedule resumes untouched (`periodsReleased` is never modified — the
    /// credit never came from escrow). No dispute-loss is recorded for either party;
    /// this is an amicable resolution, not a ruling.
    function acceptRepairCredit(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (msg.sender != lease.tenant) revert NotTenant();
        if (!lease.disputeActive) revert DisputeNotActive();
        if (lease.repairCreditHeld == 0) revert NoRepairCreditOffer();
        if (block.timestamp > lease.disputeRaisedAt + SETTLEMENT_WINDOW) revert SettlementWindowClosed();

        uint256 credit = lease.repairCreditHeld;
        lease.repairCreditHeld = 0;
        lease.disputeActive = false;
        lease.settlementProposer = address(0);
        lease.settlementProposedBps = 0;

        token.safeTransfer(lease.tenant, credit);

        emit RepairCreditAccepted(leaseId, credit);
    }

    /// @notice Repair-credit remedy (Article 4.6) — the landlord reclaims a held credit
    /// the tenant never accepted. Callable regardless of dispute state, so a landlord is
    /// never locked out of their own funds (e.g. after the dispute resolved via
    /// arbitration, though `_finalizeDispute` already auto-refunds in that case).
    function withdrawRepairCredit(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (msg.sender != lease.landlord) revert NotLandlord();
        if (lease.repairCreditHeld == 0) revert NoRepairCreditOffer();

        uint256 credit = lease.repairCreditHeld;
        lease.repairCreditHeld = 0;
        token.safeTransfer(lease.landlord, credit);

        emit RepairCreditWithdrawn(leaseId, credit);
    }

    /// @notice Tier 2 — arbiter rules on a dispute once the direct-settlement window has
    /// closed. Article 4.4.
    /// @param landlordBps Share of the remaining escrow going to the landlord, in basis
    /// points (10_000 = 100%, matching the pre-Constitution-v1.1 "release to landlord"
    /// behavior exactly; 0 matches the old full-refund-to-tenant behavior exactly).
    function resolveDispute(
        uint256 leaseId,
        uint16 landlordBps
    ) external nonReentrant leaseExists(leaseId) {
        if (msg.sender != arbiter) revert NotArbiter();
        Lease storage lease = leases[leaseId];
        if (!lease.disputeActive) revert DisputeNotActive();
        if (landlordBps > BPS_DENOMINATOR) revert InvalidBps();
        if (block.timestamp <= lease.disputeRaisedAt + SETTLEMENT_WINDOW) revert SettlementWindowNotClosed();

        _finalizeDispute(leaseId, lease, landlordBps, ResolutionType.Arbitration);
    }

    /// @notice Permissionless fallback — if the arbiter hasn't ruled within
    /// `ARBITRATION_WINDOW` of the settlement window closing, anyone may trigger an
    /// automatic resolution in the landlord's favor (100% / releaseToLandlord-equivalent).
    /// Same "anyone can trigger, nothing can indefinitely block" principle as
    /// `releaseTranche` — a non-responsive arbiter can never freeze funds forever.
    function autoResolveOverdueDispute(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (!lease.disputeActive) revert DisputeNotActive();
        uint256 arbitrationDeadline = lease.disputeRaisedAt + SETTLEMENT_WINDOW + ARBITRATION_WINDOW;
        if (block.timestamp <= arbitrationDeadline) revert ArbitrationWindowNotElapsed();

        _finalizeDispute(leaseId, lease, BPS_DENOMINATOR, ResolutionType.AutoFallback);
    }

    /// @dev Shared resolution path for settlement, arbitration, and the auto-fallback —
    /// for both rent disputes and caution claim disputes (`disputeIsCautionClaim`
    /// selects which pool of funds the ratio applies to).
    /// Rent branch: landlordBps == 10_000 exactly reproduces the pre-v1.1 "release to
    /// landlord" behavior (nothing distributed now, normal schedule resumes on the next
    /// `releaseTranche` call). Any other value distributes the entire remaining escrow
    /// now, split by ratio, and concludes the lease — a partial split can't cleanly
    /// leave a future payment stream half-obligated, so it settles in full immediately.
    /// Caution branch: always settles the claimed amount in full immediately — there's
    /// no "resume schedule" concept for a one-time claim.
    function _finalizeDispute(
        uint256 leaseId,
        Lease storage lease,
        uint16 landlordBps,
        ResolutionType resolutionType
    ) private {
        lease.disputeActive = false;
        lease.settlementProposer = address(0);
        lease.settlementProposedBps = 0;

        // Any repair credit the landlord had offered but the tenant didn't accept is
        // returned to the landlord — this dispute is concluding a different way, so the
        // offer lapses and its held funds must never be stranded in this contract.
        if (lease.repairCreditHeld > 0) {
            uint256 heldCredit = lease.repairCreditHeld;
            lease.repairCreditHeld = 0;
            token.safeTransfer(lease.landlord, heldCredit);
        }

        if (landlordBps >= BPS_DENOMINATOR / 2) {
            lease.disputesLostCount += 1;
        }

        if (lease.disputeIsCautionClaim) {
            lease.disputeIsCautionClaim = false;
            lease.cautionSettled = true;

            uint256 claimed = lease.cautionClaimedAmount;
            uint256 released = (claimed * landlordBps) / BPS_DENOMINATOR;
            uint256 refunded = claimed - released;

            if (released > 0) token.safeTransfer(lease.landlord, released);
            if (refunded > 0) token.safeTransfer(lease.tenant, refunded);

            emit CautionClaimResolved(leaseId, landlordBps, released, refunded, resolutionType);
            _tryMintCredential(leaseId, lease);
            return;
        }

        uint256 rentReleased = 0;
        uint256 rentRefunded = 0;

        if (landlordBps < BPS_DENOMINATOR) {
            uint256 remainingPeriods = lease.totalPeriods - lease.periodsReleased;
            uint256 remaining = remainingPeriods * lease.amountPerPeriod;
            rentReleased = (remaining * landlordBps) / BPS_DENOMINATOR;
            rentRefunded = remaining - rentReleased;
            lease.periodsReleased = lease.totalPeriods;
            if (lease.completedAt == 0) {
                lease.completedAt = block.timestamp;
                emit LeaseCompleted(leaseId);
            }

            if (rentReleased > 0) token.safeTransfer(lease.landlord, rentReleased);
            if (rentRefunded > 0) token.safeTransfer(lease.tenant, rentRefunded);
        }

        emit DisputeResolved(leaseId, landlordBps, rentReleased, rentRefunded, resolutionType);
    }

    /// @notice Landlord files an itemized damage claim against the caution fee. Article
    /// 6.6–6.7. Any undisputed remainder (cautionAmount - claimAmount) releases to the
    /// tenant immediately; the claimed amount opens a dispute that runs through the same
    /// settlement/arbitration/auto-fallback path as a rent dispute (Article IV).
    /// @dev Itemization itself (per-line description, cost, baseline comparison — 6.6)
    /// is validated at the platform layer before this call; the contract only verifies
    /// the claim carries evidence and does not exceed the caution fee, the same division
    /// of enforcement used for Tier 0 elsewhere in this contract.
    /// @param claimAmount Portion of the caution fee being claimed, in token base units.
    /// @param evidenceHash Hash of the itemized claim + comparison photos assembled off-chain.
    function fileDepositClaim(
        uint256 leaseId,
        uint256 claimAmount,
        bytes32 evidenceHash
    ) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (msg.sender != lease.landlord) revert NotLandlord();
        if (lease.cautionAmount == 0) revert NoCautionFee();
        if (lease.completedAt == 0) revert LeaseNotComplete();
        if (lease.cautionClaimFiledAt != 0) revert ClaimAlreadyFiled();
        if (block.timestamp > lease.completedAt + CAUTION_CLAIM_WINDOW) revert ClaimWindowClosed();
        if (claimAmount == 0 || claimAmount > lease.cautionAmount) revert InvalidClaimAmount();
        if (evidenceHash == bytes32(0)) revert NoEvidence();

        uint256 remainder = lease.cautionAmount - claimAmount;

        lease.cautionClaimedAmount = claimAmount;
        lease.cautionClaimEvidenceHash = evidenceHash;
        lease.cautionClaimFiledAt = block.timestamp;
        lease.disputeActive = true;
        lease.disputeIsCautionClaim = true;
        lease.disputeRaisedAt = block.timestamp;
        lease.disputeReason = "Caution fee damage claim";

        if (remainder > 0) token.safeTransfer(lease.tenant, remainder);

        emit DepositClaimFiled(leaseId, claimAmount, evidenceHash, remainder);
        emit DisputeRaised(leaseId, lease.tenant, lease.disputeReason);
    }

    /// @notice Permissionless — releases the full caution fee to the tenant once the
    /// 7-day claim window has passed with no claim filed. Article 6.5.
    function releaseCaution(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (lease.cautionAmount == 0) revert NoCautionFee();
        if (lease.completedAt == 0) revert LeaseNotComplete();
        if (lease.cautionClaimFiledAt != 0) revert ClaimAlreadyFiled();
        if (lease.cautionSettled) revert CautionAlreadySettled();
        if (block.timestamp <= lease.completedAt + CAUTION_CLAIM_WINDOW) revert ClaimWindowNotElapsed();

        lease.cautionSettled = true;
        token.safeTransfer(lease.tenant, lease.cautionAmount);

        emit CautionReleased(leaseId, lease.cautionAmount);
        _tryMintCredential(leaseId, lease);
    }

    /// @notice Mints the tenant a soulbound TenancyCredential the moment every
    /// condition for a clean, full lease completion is simultaneously true. Safe to
    /// call speculatively from multiple sites (releaseTranche, releaseCaution, the
    /// caution-claim resolution branch) — it's a no-op unless every condition holds,
    /// and TenancyCredential itself refuses a second mint for the same leaseId.
    /// @dev The eligibility check is the entire point of this feature: `completedNaturally`
    /// is only ever set inside releaseTranche's own completion branch, never by
    /// _finalizeDispute — so a cancelled lease (never reaches this), an early-terminated
    /// or arbitrated-away lease (forced complete via _finalizeDispute, completedNaturally
    /// stays false forever), or an evicted tenant's lease can structurally never satisfy
    /// this condition. There is no separate "was this legitimate" flag to keep in sync;
    /// the state machine itself is the enforcement.
    function _tryMintCredential(uint256 leaseId, Lease storage lease) private {
        if (credentialContract == address(0)) return;
        if (!lease.completedNaturally) return;
        if (!lease.cautionSettled && lease.cautionAmount > 0) return;
        if (lease.credentialTokenId != 0) return;

        uint256 durationDays = (lease.totalPeriods * intervalSeconds(lease.frequency)) / 1 days;

        ITenancyCredential.CredentialData memory data = ITenancyCredential.CredentialData({
            leaseId: leaseId,
            durationDays: durationDays,
            totalPeriods: lease.totalPeriods,
            onTimePeriods: lease.totalPeriods - lease.latePeriods,
            disputesLost: lease.disputesLostCount,
            completionDate: lease.completedAt
        });

        lease.credentialTokenId = ITenancyCredential(credentialContract).mintForLease(lease.tenant, data);
    }

    /// @notice Refunds the tenant in full if the landlord never signed within `SIGN_DEADLINE`.
    function cancelUnsigned(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage lease = leases[leaseId];
        if (msg.sender != lease.tenant) revert NotTenant();
        if (lease.signed) revert AlreadySigned();
        if (lease.cancelled) revert AlreadyCancelled();
        if (block.timestamp <= lease.createdAt + SIGN_DEADLINE) revert SignDeadlineNotPassed();

        lease.cancelled = true;
        lease.cautionSettled = true;
        uint256 refundAmount = lease.amountPerPeriod * lease.totalPeriods + lease.cautionAmount;

        token.safeTransfer(lease.tenant, refundAmount);

        emit LeaseCancelled(leaseId, refundAmount);
    }

    /// @notice Seconds between releases for a given frequency.
    function intervalSeconds(Frequency frequency) public pure returns (uint256) {
        if (frequency == Frequency.Monthly) return 30 days;
        if (frequency == Frequency.Quarterly) return 90 days;
        if (frequency == Frequency.Yearly) return 365 days;
        if (frequency == Frequency.Daily) return 1 days;
        return 1 hours; // Frequency.Hourly
    }

    /// @notice Number of fully elapsed, unreleased periods available to release right now.
    function pendingPeriods(uint256 leaseId) external view leaseExists(leaseId) returns (uint256) {
        Lease storage lease = leases[leaseId];
        if (!lease.signed || lease.disputeActive) return 0;

        uint256 elapsedPeriods = (block.timestamp - lease.signedAt) / intervalSeconds(lease.frequency);
        if (elapsedPeriods > lease.totalPeriods) {
            elapsedPeriods = lease.totalPeriods;
        }
        return elapsedPeriods - lease.periodsReleased;
    }

    /// @notice Full lease details.
    function getLease(uint256 leaseId) external view leaseExists(leaseId) returns (Lease memory) {
        return leases[leaseId];
    }
}
