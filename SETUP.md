# RentPact — Setup

This covers every manual step needed to move RentPact from mock mode to a
fully live testnet deployment: environment variables, Circle console
configuration, faucet links, and deploy commands.

## 1. Install

```bash
npm install                # frontend (repo root)
cd contracts && npm install # Hardhat workspace
```

## 2. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

`.env.local` and `.env` are both gitignored — never commit real values.
`.env.example` should only ever contain blanks or genuinely public network
config (chain IDs, RPC URLs, public contract addresses).

| Variable | Required | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_ARC_CHAIN_ID` | Yes | `5042002` (Arc testnet) — already filled in `.env.example` |
| `NEXT_PUBLIC_ARC_RPC_URL` | Yes | `https://rpc.testnet.arc.network` |
| `NEXT_PUBLIC_ARC_EXPLORER_URL` | Yes | `https://testnet.arcscan.app` |
| `NEXT_PUBLIC_USDC_CONTRACT_ADDRESS` | Yes | Native USDC on Arc testnet, pre-filled |
| `NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS` | After deploy | Output of the deploy script (step 4) |
| `NEXT_PUBLIC_CCTP_TOKEN_MESSENGER_ADDRESS` / `NEXT_PUBLIC_CCTP_MESSAGE_TRANSMITTER_ADDRESS` | Yes | Pre-filled from docs.arc.io |
| `NEXT_PUBLIC_GATEWAY_WALLET_ADDRESS` / `NEXT_PUBLIC_GATEWAY_MINTER_ADDRESS` | Yes | Pre-filled from docs.arc.io |
| `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` | Optional | Free key at unsplash.com/developers — see note below |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project → Settings → API (step 2a) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase project → Settings → API (step 2a) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project → Settings → API — **server-only, never commit** |
| `NEXT_PUBLIC_CIRCLE_APP_ID` | For real Circle mode | Circle console (step 3) |
| `CIRCLE_API_KEY` | For real Circle mode | Circle console (step 3) — **server-only, never commit** |
| `CIRCLE_ENTITY_SECRET` | For real Circle mode | Circle console (step 3) — **server-only, never commit** |
| `ARC_DEPLOYER_PRIVATE_KEY` | For contract deploy | Your funded testnet wallet — **never commit** |
| `ARC_ARBITER_ADDRESS` | For contract deploy | Address authorized to resolve disputes |
| `NEXT_PUBLIC_MOCK_MODE` | Yes | `true` until steps 3–4 are done, then `false` |

### A note on Unsplash

The brief's original plan referenced `source.unsplash.com` — Unsplash's free
keyword-redirect service. That service was deprecated by Unsplash and no
longer resolves. This app calls the real `api.unsplash.com` instead, gated
by an optional access key. Without a key, property cards render a designed
SVG architectural illustration instead of a photo — never a broken image.

### 2a. Supabase (database + auth)

Everything server-side — listings, messages, profiles, reviews, templates,
notification/privacy prefs, lease-constitution/dispute-ruling/move-out
records — lives in Postgres via Supabase, and sign-in is **Google OAuth
only** (`src/components/GoogleSignInButton.tsx`) — no passwords, no OTP
codes, no outbound email dependency of any kind, since Google verifies the
user's identity itself. Lease lifecycle data itself is *not* here — it's
sourced from the deployed `RentPactEscrow` contract (or localStorage in mock
mode); see `src/lib/leaseData.ts`.

1. Create a free project at **supabase.com** (new org → new project → set a
   database password → pick a region).
2. In **Project Settings → API**, copy the **Project URL**, **anon public**
   key, and **service_role** key into `.env.local` as shown in the table
   above.
3. In the Supabase SQL editor, run every file in `supabase/migrations/` in
   numeric order (each whole file, once) — tables, indexes, RLS policies,
   and the public `photos` storage bucket.
4. Set up Google as an auth provider:
   - **Google Cloud Console** (console.cloud.google.com): create/select a
     project → **APIs & Services → OAuth consent screen** → External → fill
     in app name + support email → save. Then **APIs & Services →
     Credentials → Create Credentials → OAuth client ID** → Application
     type: Web application → under **Authorized redirect URIs** add the
     callback URL Supabase shows you in the next step (looks like
     `https://<project-ref>.supabase.co/auth/v1/callback`) → copy the
     generated **Client ID** and **Client Secret**.
   - **Supabase dashboard → Authentication → Providers → Google**: enable
     it, paste the Client ID + Client Secret, save.
   - **Supabase dashboard → Authentication → URL Configuration → Redirect
     URLs**: add `http://localhost:3000/auth/callback` for local dev (add
     your production URL's equivalent once deployed).
5. No SMTP setup needed — Google handles identity verification, so this app
   never sends its own auth emails. (An earlier version of this app used
   email OTP / email+password; both were dropped in favor of Google sign-in
   specifically to avoid the SMTP/domain/rate-limit dependency entirely.)

## 3. Circle console setup (for real Wallets + Gas Station)

Everything works today in `NEXT_PUBLIC_MOCK_MODE=true` with zero Circle
credentials. To go live:

1. Create an account at **console.circle.com** and open the **Web3 Services**
   product.
2. Under **Configurator → Wallets**, create a **Wallet Set** for user-controlled,
   **SCA (smart contract account)** wallets — SCA is required for Gas Station
   sponsorship to apply.
3. Copy your **API Key** into `CIRCLE_API_KEY` and your **Entity Secret**
   into `CIRCLE_ENTITY_SECRET` (Settings → Entity Secret Management).
4. Under **Configurator → Web SDK**, register this app and copy the **App ID**
   into `NEXT_PUBLIC_CIRCLE_APP_ID`.
5. Under **Configurator → Gas Station**, create a **Policy**:
   - Scope it to the Arc testnet blockchain (identifier `ARC-TESTNET` —
     verified against a live account on 2026-07-11) and the deployed
     `RentPactEscrow` contract address (from step 4 below).
   - Set a reasonable per-transaction and daily sponsorship limit.
6. Set `NEXT_PUBLIC_MOCK_MODE=false`.

The frontend never talks to Circle directly for anything requiring
`CIRCLE_API_KEY` — all of that goes through the server-only proxy routes in
`src/app/api/circle/*` (see `src/lib/circleServer.ts`). Only the ephemeral,
60-minute `userToken` reaches the browser, which is how Circle's own SDK
architecture expects user-controlled wallets to work.

## 4. Deploy the contract

1. Get Arc testnet USDC from the faucet: **https://faucet.circle.com**
2. In `.env.local` (repo root — `contracts/hardhat.config.ts` reads both
   `../.env` and `../.env.local`), set:
   - `ARC_DEPLOYER_PRIVATE_KEY` — your funded wallet's private key
   - `ARC_ARBITER_ADDRESS` — address authorized to resolve disputes
3. From `contracts/`:
   ```bash
   npm run compile
   npm test
   npm run deploy:arc-testnet
   ```
4. Copy the printed address into `NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS` in
   `.env.local`.

## 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`. If required env vars are missing or invalid,
you'll see a developer-facing configuration error page listing exactly what's
wrong instead of a broken app.

## Arbiter model

`RentPactEscrow` uses a single trusted arbiter address for dispute
resolution in this version. Before handling real funds, replace it with a
panel — a Safe multisig or a small DAO-governed resolver contract exposing
the same `resolveDispute` call surface. See the NatSpec on the contract for
the intended production path.
