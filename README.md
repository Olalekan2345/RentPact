# RentPact

**Rent held in escrow, released on schedule, frozen on dispute — no bank, no lawyer, no trust required.**

## The problem

In Lagos and many rental markets, landlords demand 1–2 years of rent
upfront. Tenants pay everything on day one with zero protection — no
escrow, no tribunal, no recourse if the landlord breaches the lease. The
tenant is fully exposed the moment the money changes hands.

## The solution

RentPact replaces that upfront cash handoff with a USDC smart contract
escrow on **Arc**, Circle's stablecoin-native Layer 1:

1. The tenant deposits the full lease amount into escrow once, up front.
2. The landlord countersigns on-chain, starting a release schedule the two
   parties agreed to — **monthly, quarterly, or yearly**.
3. Rent releases to the landlord automatically each period. If the landlord
   breaches, the tenant freezes the next release with a single on-chain
   dispute — no bank, no lawyer, no waiting on anyone's goodwill.

Every user transaction is gasless (Circle Gas Station), every wallet is
created silently behind an email login (Circle Wallets — the word "wallet"
never appears during onboarding), and tenants can fund escrow from any
supported testnet via CCTP burn-and-mint, with a unified cross-chain balance
shown through Circle Gateway.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Browser (Next.js)                        │
│                                                                       │
│  Landing → Auth → Create Lease → Deposit → Dashboard → Lease detail │
│                                                  │         │          │
│                                          Dispute panel   Invite/Sign │
│                                                                       │
│   src/components/escrow/EscrowTimeline.tsx  (frequency-agnostic)    │
│   src/lib/leaseStore.ts   — lease lifecycle (mirrors contract rules)│
│   src/lib/circle.ts       — Circle abstraction, MOCK_MODE-gated     │
│   src/lib/circleSdk.ts    — @circle-fin/w3s-pw-web-sdk (PIN UI)     │
└───────────────┬───────────────────────────────────┬─────────────────┘
                │                                     │
                │ viem (reads)                        │ fetch (proxied)
                ▼                                     ▼
┌───────────────────────────┐         ┌───────────────────────────────┐
│   Arc Testnet (chain 5042002)       │  Next.js API routes            │
│   RentPactEscrow.sol                │  src/app/api/circle/*          │
│   - createLease / signLease         │  (server-only — holds          │
│   - releaseTranche (permissionless) │   CIRCLE_API_KEY,               │
│   - raiseDispute / resolveDispute   │   CIRCLE_ENTITY_SECRET)         │
│   - cancelUnsigned                  │         │                       │
│   USDC = native gas token           │         ▼                       │
└───────────────────────────┘         ┌───────────────────────────────┐
                                       │  Circle Web3 Services API      │
                                       │  Wallets · Gas Station ·       │
                                       │  CCTP V2 · Gateway              │
                                       └───────────────────────────────┘
```

## Arc & Circle products used

| Product | Purpose in RentPact | Where it lives |
|---|---|---|
| **Arc testnet** | Settlement chain — USDC is the native gas token | [`src/lib/chain.ts`](src/lib/chain.ts), [`contracts/hardhat.config.ts`](contracts/hardhat.config.ts) |
| **Native USDC (Arc)** | Escrow currency | [`contracts/contracts/RentPactEscrow.sol`](contracts/contracts/RentPactEscrow.sol) (`token` immutable), [`.env.example`](.env.example) |
| **RentPactEscrow.sol** | Frequency-aware escrow, lifecycle, disputes | [`contracts/contracts/RentPactEscrow.sol`](contracts/contracts/RentPactEscrow.sol) |
| **Circle Wallets** (user-controlled) | Silent, seedless wallet creation on email signup | [`src/lib/circle.ts`](src/lib/circle.ts) (`getOrCreateWallet`), [`src/lib/circleSdk.ts`](src/lib/circleSdk.ts), [`src/app/api/circle/users*`](src/app/api/circle/users), [`src/app/api/circle/wallets*`](src/app/api/circle/wallets) |
| **Circle Gas Station / Paymaster** | Every user-facing transaction is gasless | [`src/lib/circle.ts`](src/lib/circle.ts) (`sendGaslessTransaction`), [`src/app/api/circle/transactions/*`](src/app/api/circle/transactions) |
| **Circle CCTP V2** | Cross-chain USDC deposit (burn-and-mint into Arc) | [`src/lib/circle.ts`](src/lib/circle.ts) (`initiateCctpDeposit`), [`src/app/leases/new/deposit/page.tsx`](src/app/leases/new/deposit/page.tsx) |
| **Circle Gateway** | Unified USDC balance across chains on the deposit screen | [`src/lib/circle.ts`](src/lib/circle.ts) (`getGatewayBalances`) |

`src/lib/circleServer.ts` is the **only** place `CIRCLE_API_KEY` is used —
it's a server-only module (enforced by the `server-only` package) called
exclusively from the API routes above, never imported client-side.

## Design system

- Palette, type scale, radii, shadows, and micro-interaction keyframes:
  [`tailwind.config.ts`](tailwind.config.ts)
- Base components (Button, Card, Input, Badge, SegmentedControl, Skeleton,
  CountUp): [`src/components/ui/`](src/components/ui/)
- The signature escrow timeline — the one component every frequency and
  every node state has to render correctly through:
  [`src/components/escrow/EscrowTimeline.tsx`](src/components/escrow/EscrowTimeline.tsx)
  (isolated preview at `/dev/timeline`)

## No hardcoded data

Every number on every screen comes from the contract, the Circle SDK, or
user input — see [`src/lib/leaseStore.ts`](src/lib/leaseStore.ts) (lease
lifecycle), [`src/lib/circle.ts`](src/lib/circle.ts) (mock layer generates
responses dynamically from user input, never fixtures), and
[`src/lib/fx.ts`](src/lib/fx.ts) (live exchange rate with graceful
fallback — no stale or fabricated numbers).

## Running it

```bash
npm install
cp .env.example .env.local   # already has real Arc testnet public config
npm run dev
```

Works immediately in mock mode — no Circle credentials or contract
deployment required to try the full lease lifecycle. See
[`SETUP.md`](SETUP.md) for going live: contract deployment, Circle console
configuration, and faucet links.

## Contracts

```bash
cd contracts
npm install
npm test          # full lifecycle across all 3 frequencies, disputes, refunds
npm run compile
```

## Status

Built through Phases 1–7 of the build plan: design system, smart contract
+ tests, the escrow timeline component, all product pages wired to the
mock data layer (with real Circle/viem integration code paths ready behind
`MOCK_MODE`), Gas Station/Wallets real-mode wiring, a WCAG-AA polish pass,
and this documentation. Contract deployment and live Circle credentials are
the two remaining manual steps — see [`SETUP.md`](SETUP.md).
