# THE RENTPACT CONSTITUTION

**Version 1.2**

The binding rules of escrow and dispute resolution for every lease created on RentPact.

---

## PREAMBLE

RentPact exists to make renting fair for both tenants and landlords through transparent, predictable, code-enforced rules. This Constitution is accepted by both parties at the moment of lease signing. Its hash is recorded for every lease, making the version each party agreed to permanent and verifiable.

No party — including RentPact itself — may alter the rules of an active lease. Changes to this Constitution apply only to leases created after the new version is published.

The guiding principle of every rule in this document: **evidence decides, not argument.**

---

## ARTICLE I — THE ESCROW

**1.1** Upon lease creation, the tenant deposits the full lease value (amount per period × number of periods) in USDC into the RentPact escrow smart contract on Arc.

**1.2** Escrowed funds are held by the smart contract alone. No person, company, or administrator — including RentPact — holds custody of escrowed funds or may move them outside the rules of this Constitution.

**1.3** Funds are released to the landlord in equal tranches on the schedule chosen at lease creation: every 30 days (Monthly), every 90 days (Quarterly), or every 365 days (Yearly), measured from the moment the landlord signs the lease.

**1.4** A scheduled release executes automatically unless an active dispute exists on the lease at the moment of release. Anyone may trigger an elapsed release; no one may prevent one except through a valid dispute under Article IV.

**1.5** If the landlord does not sign the lease within 7 days of creation, the tenant may cancel and receive an immediate, full, automatic refund.

**1.6** If a caution fee (security deposit) is included, it is held in the same escrow contract, separate from rent tranches, and is governed by Article VI. The caution fee is never held by, transferred to, or controlled by the landlord at any point during the lease.

---

## ARTICLE II — THE PROPERTY CONDITION BASELINE

**2.1** Before a lease can be signed, the landlord must complete the Property Condition Declaration: a condition checklist for each area of the property, a baseline photo set (minimum one photo per declared room), and a Known Defects disclosure.

**2.2** Every baseline file is hashed and the hashes recorded at lease creation. The baseline cannot be added to, edited, or replaced after the tenant signs.

**2.3** **The Disclosure Shield:** any defect the landlord discloses — by marking an area "Known issue" or describing it in the Known Defects section — before signing cannot be the basis of a dispute by the tenant. By signing, the tenant accepts the property with all disclosed defects.

**2.4** **The Concealment Rule:** any material defect that existed at move-in but was NOT disclosed, and is discoverable in the tenant's first 14 days of occupancy, may be reported by the tenant as an issue with full dispute rights, regardless of the maintenance responsibility matrix.

**2.5** The lease includes a Maintenance Responsibility Matrix, declared per area at listing time. Unless the landlord customises it, the default matrix applies:
- **Landlord responsibility:** structural elements, roof, plumbing mains and fixtures, electrical wiring and distribution, water supply systems, doors and locks (wear), pest infestation predating occupancy.
- **Tenant responsibility:** light bulbs, minor fittings, cleaning, damage caused by the tenant or the tenant's guests, and any alteration made by the tenant.

---

## ARTICLE III — ISSUE REPORTING

**3.1** During the lease, the tenant may file an Issue Report containing: a category (plumbing, electrical, structural, security, pest, other), a severity level (cosmetic, affects daily living, urgent/safety), a description, and photo or video evidence. Every evidence file is hashed at the moment of submission.

**3.2** The landlord has **48 hours** to acknowledge an Issue Report from the moment of submission.

**3.3** Upon acknowledging, the landlord must resolve the issue within a reasonable window by severity: urgent/safety issues within **72 hours** of acknowledgment; issues affecting daily living within **7 days**; cosmetic issues within **21 days**.

**3.4** The landlord may post their own photo or video evidence of repairs. The tenant confirms resolution or reopens the issue with counter-evidence.

**3.5** **The Escalation Rule:** an Issue Report that is (a) a landlord responsibility under the matrix, (b) not covered by the Disclosure Shield, and (c) either unacknowledged past 48 hours or unresolved past its severity window, automatically unlocks the tenant's right to raise a dispute with that issue attached as evidence.

**3.6** Filing knowingly false or fabricated issue reports is a violation of this Constitution and grounds for dispute rejection plus a permanent record on the filing party's profile under Article VII.

---

## ARTICLE IV — DISPUTES

**4.1** Only the tenant may freeze a tranche, and only by raising a dispute before that tranche's release time. A dispute freezes all future releases until resolved. Already-released tranches are never reversible.

**4.2** **Automatic Validity Rules (Tier 0).** The platform enforces these before any human review, and blocks submission of a dispute that fails them:
- A dispute citing a defect covered by the Disclosure Shield is **automatically rejected**.
- A dispute citing a tenant-responsibility item under the matrix is **automatically rejected**.
- A dispute with no attached Issue Report or evidence is **automatically dismissed** if evidence is not attached within 72 hours of filing.
- A dispute attached to an issue that qualifies under the Escalation Rule (3.5) is **presumptively valid** and proceeds directly to Tier 1.

**4.3** **Direct Settlement (Tier 1).** Upon a valid dispute, a 7-day settlement window opens. Either party may propose a split of the remaining escrow, stated as a landlord/tenant ratio (any ratio, including full release or full refund). A proposal accepted by the other party executes immediately and on-chain: at a 100%-to-landlord ratio, the tranche unfreezes and the lease resumes its normal release schedule; at any other ratio, the remaining escrow is distributed by that ratio at once and the lease concludes.

**4.4** **Arbitration (Tier 2).** If no settlement is reached within 7 days, the dispute enters arbitration:
- The arbitration panel reviews the automatically assembled evidence timeline: the condition baseline, the issue report(s) with timestamps, the message record, the repair record or its absence, and both parties' statements.
- The panel must rule within **5 days** of the settlement window closing.
- The panel's ruling is a landlord/tenant ratio for the remaining escrow — including the special cases of releasing it in full to the landlord (schedule resumes) or refunding it in full to the tenant (lease concludes).
- Every ruling must include written reasoning, recorded alongside the ruling.
- **The Ruling Deadline Fallback:** if no ruling is recorded within the 5-day arbitration window, anyone may trigger an automatic resolution that releases the remaining escrow to the landlord in full and resumes the lease schedule. This protects both parties from a dispute being held open indefinitely by arbiter inaction; it is not a judgment on the merits.

**4.5** Arbiters are bound by this Constitution. They interpret its rules against the evidence; they may not introduce standards outside it. Where this Constitution is silent, arbiters rule according to what the evidence shows a reasonable and honest landlord and tenant would have expected at signing.

**4.6** **Repair Credit (Tier 1).** As an alternative to splitting escrow, at any point while the 7-day settlement window is open the landlord may offer the tenant a fixed repair credit — for example, to reimburse a repair the tenant arranged themselves. The credit is paid from the landlord's own funds, never from escrow. When offered, the credit is transferred into the escrow contract and held; the tenant's acceptance releases it to the tenant, clears the dispute, and resumes the lease on its normal release schedule with no change to the remaining escrow or the release count. Because acceptance and payment occur in a single on-chain transaction, neither party can accept without the other being paid, and neither can be paid without the dispute clearing. A credit the tenant does not accept may be withdrawn by the landlord, and is returned to the landlord automatically if the dispute instead resolves through settlement, arbitration, or the ruling-deadline fallback. A dispute resolved by an accepted repair credit records no fault against either party. Repair credit is not available for caution-fee claim disputes (Article 6.7), which concern a one-time deposit rather than an ongoing release schedule.

**4.7** An AI assistant may prepare evidence summaries, applicable-rule checklists, and draft recommendations for the panel. **No dispute is ever decided by AI alone.** Every ruling carries the signatures of human arbiters.

**4.8** Settlement acceptances and arbitration rulings execute automatically on-chain and are final within RentPact. Nothing in this Constitution prevents either party from pursuing remedies under applicable law outside the platform.

**4.8** After a dispute is resolved, the lease schedule resumes. Raising three disputes ruled invalid or frivolous within a single lease permanently disables the dispute function for that lease and is recorded under Article VII.

---

## ARTICLE V — TERMINATION AND CANCELLATION

**5.1** A lease may end early only by: (a) mutual agreement of both parties, executed on-chain, with remaining escrow returned to the tenant; (b) landlord failure to sign under 1.5; or (c) an arbitration ruling that orders termination in cases of severe, evidenced breach (uninhabitable property, illegal lockout, or safety hazard unremedied past its window).

**5.2** On early termination, tranches already released remain with the landlord; all unreleased escrow returns to the tenant, minus any tranche amount an arbitration ruling assigns otherwise.

**5.3** Neither party may terminate unilaterally outside these provisions. Abandonment by the tenant does not entitle the tenant to a refund of the current period.

---

## ARTICLE VI — LEASE COMPLETION

**6.1** At lease end, both parties complete a Move-Out Condition record: the tenant's exit photos are compared against the landlord's baseline from Article II.

**6.2** Where a caution fee was included (Article 1.6), its return is governed by 6.5–6.7 below: automatic within 7 days of lease end unless the landlord files an itemized damage claim against it, evidenced against the Move-Out Condition record.

**6.3** Fair wear and tear — the natural decline of a property under normal, careful use — is never chargeable against the caution fee. Damage beyond fair wear, measured against the baseline, is.

**6.4** Upon completion, both parties may leave a review of the other. Reviews unlock only after the lease fully completes and any caution fee claims resolve, so that no review can be used as leverage during an active lease.

**6.5 — The Caution Fee Guarantee.** The caution fee is held by the escrow contract, never by the landlord. It releases automatically to the tenant 7 days after lease completion unless the landlord files a damage claim with photo evidence within that window. A landlord cannot decline, delay, or condition the return — only a valid damage claim resolved under Article IV can reduce it.

**6.6 — Itemized Claims Only.** A damage claim against the caution fee must itemize each damage with its estimated repair cost and photo evidence compared against the Article II baseline. Blanket claims ("general damages — full deposit") are automatically rejected under Tier 0 (Article 4.2). Itemization is validated at the platform layer before the claim's evidence hash is recorded on-chain; the contract itself enforces only that a claim carries evidence and does not exceed the caution fee, the same division of enforcement described for Tier 0 elsewhere in this Constitution.

**6.7 — Partial Claims, Partial Returns.** If a damage claim covers less than the full caution fee, the undisputed remainder releases to the tenant immediately upon the claim being filed — it does not wait for the claim's resolution. Only the claimed portion enters the Article IV dispute process.

---

## ARTICLE VII — REPUTATION

**7.1** Every completed lease, on-time payment record, dispute outcome, and constitutional violation is recorded to each party's RentPact profile as their portable rental reputation.

**7.2** Reputation records are factual and outcome-based: what happened, as recorded on-chain or by the platform. RentPact does not editorialize.

**7.3** A party's reputation is visible to any counterparty before lease signing. Entering a lease is always a choice made with the other party's history in view.

---

## ARTICLE VIII — THE PLATFORM

**8.1** RentPact operates the interface, the evidence infrastructure, and the arbitration process. RentPact never holds user funds and cannot move escrowed money outside the rules of this Constitution.

**8.2** RentPact may amend this Constitution by publishing a new version with a new hash. Amendments never apply retroactively to active leases.

**8.3** If the platform interface becomes unavailable, escrowed funds remain safe and withdrawable according to the smart contract's rules, which mirror this Constitution wherever the contract has been extended to enforce them. The contract, not the website, is the source of truth for whatever it directly controls.

**8.4** This version of the Constitution is deployed alongside a smart contract that enforces Articles I–IV and VI as written, including the ratio-split settlement and arbitration of 4.3–4.4, the repair-credit remedy of 4.6, the ruling-deadline fallback of 4.4, and the caution fee escrow, auto-release, and partial-return rules of 6.5–6.7. One piece of 6.6 remains application-layer, not contract-enforced, and is disclosed here the same way Tier 0's disclosure-shield and matrix checks are elsewhere in this Constitution: the contract verifies a claim carries evidence and does not exceed the caution fee, but whether that evidence is genuinely itemized (as 6.6 requires) is validated at the platform layer before the claim reaches the contract.

**8.5** This Constitution's hash is recorded immutably by the smart contract at deployment (not per-lease); every lease created under a given deployment shares that deployment's hash and version. A new Constitution version is published only alongside a new contract deployment, consistent with 8.2 — existing leases continue under the version and contract they were created on.

---

## FINAL PROVISION

By signing a RentPact lease, both parties confirm they have read this Constitution, accept its rules as binding for the full duration of the lease, and agree that the evidence trail — baseline, reports, timestamps, and on-chain records — is the sole basis on which any disagreement will be judged.

**Evidence decides. Not argument.**

---

*Constitution Version 1.3 — hash recorded immutably in the RentPactEscrow contract at deployment. RentPact is built on Arc and powered by Circle. Escrow in USDC.*

*v1.3 — Added the repair-credit remedy: a landlord-funded credit that resolves a dispute without dividing escrow, so the lease continues on its normal schedule (Article 4.6).*
*v1.2 — Added caution fee guarantee, itemized claims requirement, and partial return rule (clauses 1.6, 6.5–6.7).*
*v1.1 — Added ratio-split settlement and arbitration, the arbitration ruling-deadline fallback, and on-chain constitutionHash (Article 4.3–4.4, 8.5).*
