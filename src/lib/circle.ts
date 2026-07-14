import { keccak256, toHex, formatUnits, type Address } from "viem";
import { envResult } from "@/lib/env";
import { executeCircleChallenge } from "@/lib/circleSdk";
import { publicClient, usdcAddress } from "@/lib/contracts/rentPactEscrow";
import { encodeTransfer, toBaseUnits } from "@/lib/contracts/onChainLease";

/**
 * Circle Web3 Services integration layer.
 *
 * MOCK_MODE (default, until real Circle credentials are configured):
 * every function below derives its response deterministically from the
 * caller's input (email, address, amount) plus a client-side ledger
 * persisted in localStorage — never from static fixture data. A brand
 * new email always starts at zero balance with no transaction history.
 *
 * Real mode (NEXT_PUBLIC_MOCK_MODE=false): calls Circle's REST APIs via the
 * server-only proxy in src/app/api/circle/* (so CIRCLE_API_KEY never reaches
 * the browser). Endpoint shapes verified against developers.circle.com's
 * published OpenAPI specs at the time this was written:
 *   1. POST /users                              — create a Circle user
 *   2. POST /users/token                        — exchange userId for a 60-min
 *                                                  userToken + encryptionKey
 *   3. POST /user/initialize                    — start wallet creation
 *                                                  (accountType: SCA, required
 *                                                  for Gas Station sponsorship),
 *                                                  returns { challengeId }
 *   4. Web SDK: W3SSdk.execute(challengeId)     — Circle's hosted PIN UI creates
 *                                                  the wallet; the user never
 *                                                  sees a seed phrase.
 *   5. GET /wallets                              — fetch the created wallet's
 *                                                  id + address
 *   6. POST /user/transactions/contractExecution — propose a contract call,
 *                                                  returns { challengeId }
 *   7. Web SDK: W3SSdk.execute(challengeId)     — user approves; Gas Station
 *                                                  sponsors the fee per the
 *                                                  console policy (see SETUP.md)
 *   8. GET /transactions/{id}                    — poll until the on-chain
 *                                                  txHash is available
 *
 * Verified 2026-07-11 against a live Circle account: POST /user/initialize
 * with blockchains: ["ARC-TESTNET"] returns a real challengeId, confirming
 * this is the correct Circle blockchain identifier for Arc testnet.
 */

const ARC_TESTNET_BLOCKCHAIN = "ARC-TESTNET";

export const MOCK_MODE = envResult.success ? envResult.env.NEXT_PUBLIC_MOCK_MODE : true;

const CIRCLE_SESSION_KEY = "rentpact:circle-session:v1";

interface CircleSession {
  userId: string;
  userToken: string;
  encryptionKey: string;
  walletId: string;
}

function getCircleSession(): CircleSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CIRCLE_SESSION_KEY);
    return raw ? (JSON.parse(raw) as CircleSession) : null;
  } catch {
    return null;
  }
}

function setCircleSession(session: CircleSession) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CIRCLE_SESSION_KEY, JSON.stringify(session));
}

function requireAppId(): string {
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID;
  if (!appId) throw new Error("NEXT_PUBLIC_CIRCLE_APP_ID is not set — see SETUP.md.");
  return appId;
}

/** Stable Circle userId derived from email — Circle userIds must avoid "@"/".". */
function circleUserIdFromEmail(email: string): string {
  return `rp_${keccak256(toHex(email.trim().toLowerCase())).slice(2, 34)}`;
}

async function ensureUserTokenForEmail(email: string): Promise<{ userId: string; userToken: string; encryptionKey: string }> {
  const userId = circleUserIdFromEmail(email);

  const requestToken = () =>
    fetch("/api/circle/users/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

  let tokenRes = await requestToken();
  if (!tokenRes.ok) {
    // User likely doesn't exist yet — create then retry. Circle's create-user
    // call is expected to no-op/error harmlessly if the user already exists.
    await fetch("/api/circle/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    tokenRes = await requestToken();
  }
  if (!tokenRes.ok) throw new Error("Could not establish a Circle user session.");

  const json = await tokenRes.json();
  const { userToken, encryptionKey } = json.data ?? {};
  if (!userToken || !encryptionKey) throw new Error("Circle did not return a user session.");
  return { userId, userToken, encryptionKey };
}

/** Circle's userToken expires after 60 minutes — always fetch a fresh one before use. */
async function refreshUserToken(userId: string): Promise<{ userToken: string; encryptionKey: string }> {
  const res = await fetch("/api/circle/users/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Could not refresh the Circle session — please sign in again.");
  const json = await res.json();
  const { userToken, encryptionKey } = json.data ?? {};
  if (!userToken || !encryptionKey) throw new Error("Circle did not return a refreshed session.");
  return { userToken, encryptionKey };
}

async function fetchExistingWallet(userToken: string): Promise<{ id: string; address: Address } | null> {
  const res = await fetch("/api/circle/wallets", { headers: { "X-User-Token": userToken } });
  if (!res.ok) return null;
  const json = await res.json();
  const wallet = json?.data?.wallets?.[0];
  return wallet ? { id: wallet.id, address: wallet.address as Address } : null;
}

const LEDGER_KEY = "rentpact:mock-ledger:v1";

export interface CircleWallet {
  address: Address;
  walletId: string;
  email: string;
}

export interface MockTransaction {
  hash: `0x${string}`;
  kind: "deposit" | "cctp-deposit" | "gasless-call";
  chain: string;
  amount: number;
  timestamp: number;
}

interface MockLedger {
  wallets: Record<string, CircleWallet>; // keyed by lowercased email
  balances: Record<string, Record<string, number>>; // address -> chain -> USDC balance
  transactions: MockTransaction[];
}

function emptyLedger(): MockLedger {
  return { wallets: {}, balances: {}, transactions: [] };
}

function readLedger(): MockLedger {
  if (typeof window === "undefined") return emptyLedger();
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as MockLedger) : emptyLedger();
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger: MockLedger) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // localStorage unavailable — mock state simply won't persist across reloads
  }
}

/** Derives a deterministic, valid-looking EVM address from an email — mock-mode only. */
function deriveMockAddress(email: string): Address {
  const hash = keccak256(toHex(`rentpact-mock-wallet:${email.trim().toLowerCase()}`));
  return `0x${hash.slice(-40)}` as Address;
}

function fakeTxHash(seed: string): `0x${string}` {
  return keccak256(toHex(`${seed}:${Date.now()}:${Math.random()}`));
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Silently provisions (or fetches) a wallet for the given email. In mock mode this
 * never surfaces a seed phrase or private key — same UX contract as the real SDK.
 */
export async function getOrCreateWallet(email: string): Promise<CircleWallet> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!MOCK_MODE) {
    const appId = requireAppId();
    const { userId, userToken, encryptionKey } = await ensureUserTokenForEmail(normalizedEmail);

    let wallet = await fetchExistingWallet(userToken);
    if (!wallet) {
      const initRes = await fetch("/api/circle/wallets/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken,
          idempotencyKey: crypto.randomUUID(),
          blockchains: [ARC_TESTNET_BLOCKCHAIN],
        }),
      });
      if (!initRes.ok) throw new Error("Could not start wallet creation.");
      const initJson = await initRes.json();
      const challengeId = initJson?.data?.challengeId;
      if (!challengeId) throw new Error("Circle did not return a wallet-setup challenge.");

      // Circle's hosted PIN UI — the user sets a PIN, never sees a seed phrase.
      await executeCircleChallenge({ appId, userToken, encryptionKey, challengeId });

      wallet = await fetchExistingWallet(userToken);
      if (!wallet) throw new Error("Wallet creation did not complete.");
    }

    setCircleSession({ userId, userToken, encryptionKey, walletId: wallet.id });
    return { address: wallet.address, walletId: wallet.id, email: normalizedEmail };
  }

  await delay(600); // mimics the "setting up your secure account" moment

  const ledger = readLedger();
  const existing = ledger.wallets[normalizedEmail];
  if (existing) return existing;

  const wallet: CircleWallet = {
    address: deriveMockAddress(normalizedEmail),
    walletId: keccak256(toHex(`walletId:${normalizedEmail}`)).slice(0, 18),
    email: normalizedEmail,
  };

  ledger.wallets[normalizedEmail] = wallet;
  ledger.balances[wallet.address] ??= {};
  writeLedger(ledger);

  return wallet;
}

export interface GaslessCallParams {
  from: Address;
  to: Address;
  data: `0x${string}`;
  description: string;
}

/**
 * Relays a transaction through Circle's Gas Station / Paymaster so the end user
 * never holds native gas. Mock mode fabricates a realistic tx hash and records it —
 * it does not touch the real Arc testnet contract. Real submission happens once
 * Phase 5 wires the Paymaster and a deployed contract address are both configured.
 */
export async function sendGaslessTransaction(params: GaslessCallParams): Promise<{ hash: `0x${string}` }> {
  if (!MOCK_MODE) {
    const appId = requireAppId();
    const cachedSession = getCircleSession();
    if (!cachedSession) throw new Error("No active Circle session — please sign in again.");

    const { userToken, encryptionKey } = await refreshUserToken(cachedSession.userId);
    const session = { ...cachedSession, userToken, encryptionKey };
    setCircleSession(session);

    const createRes = await fetch("/api/circle/transactions/contract-execution", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Token": session.userToken },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId: session.walletId,
        contractAddress: params.to,
        callData: params.data,
      }),
    });
    if (!createRes.ok) {
      const body = await createRes.text();
      console.error("[circle] contract-execution request failed", createRes.status, body);
      throw new Error(`Could not submit the transaction to Gas Station: ${body}`);
    }
    const createJson = await createRes.json();
    const challengeId: string | undefined = createJson?.data?.challengeId;
    if (!challengeId) {
      throw new Error(`Circle did not return a transaction challenge. Response: ${JSON.stringify(createJson)}`);
    }

    // User approves via Circle's hosted UI; Gas Station sponsors the fee per
    // the console policy configured for this wallet/contract (see SETUP.md).
    // Circle only assigns a transaction id once the challenge is approved —
    // the create-transaction call above returns just the challengeId.
    console.info("[circle] awaiting SDK challenge execution", { challengeId });
    await executeCircleChallenge({
      appId,
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
      challengeId,
    });

    // Find the transaction the approved challenge produced, then poll it
    // until it lands on-chain and a real tx hash is assigned.
    let transactionId: string | undefined;
    for (let attempt = 0; attempt < 6 && !transactionId; attempt++) {
      await delay(1000);
      const listRes = await fetch(`/api/circle/transactions?walletId=${session.walletId}`, {
        headers: { "X-User-Token": session.userToken },
      });
      if (!listRes.ok) continue;
      const listJson = await listRes.json();
      transactionId = listJson?.data?.transactions?.[0]?.id;
    }
    if (!transactionId) throw new Error("Could not find the transaction created by the approved challenge.");

    for (let attempt = 0; attempt < 12; attempt++) {
      await delay(1500);
      const statusRes = await fetch(`/api/circle/transactions/${transactionId}`, {
        headers: { "X-User-Token": session.userToken },
      });
      if (!statusRes.ok) {
        console.warn("[circle] status poll failed", statusRes.status, await statusRes.text());
        continue;
      }
      const statusJson = await statusRes.json();
      const tx = statusJson?.data?.transaction;
      console.info("[circle] poll", attempt, tx?.state);
      if (tx?.txHash) return { hash: tx.txHash as `0x${string}` };
      if (tx?.state === "FAILED") throw new Error("The transaction failed on-chain.");
    }
    throw new Error("Timed out waiting for transaction confirmation.");
  }

  await delay(900);

  const ledger = readLedger();
  const hash = fakeTxHash(`${params.from}:${params.to}:${params.data}`);
  ledger.transactions.push({
    hash,
    kind: "gasless-call",
    chain: "arc-testnet",
    amount: 0,
    timestamp: Date.now(),
  });
  writeLedger(ledger);

  return { hash };
}

export interface ChainBalance {
  chain: string;
  chainLabel: string;
  balance: number;
}

const GATEWAY_SUPPORTED_CHAINS = [
  { chain: "arc-testnet", chainLabel: "Arc Testnet" },
  { chain: "base-sepolia", chainLabel: "Base Sepolia" },
  { chain: "eth-sepolia", chainLabel: "Ethereum Sepolia" },
] as const;

/**
 * Unified USDC balance across chains, as Circle Gateway would present it.
 * Mock mode reads only from the local ledger — balances only ever change in
 * response to actual deposit/CCTP actions taken in this app.
 *
 * Real mode: Gateway's actual cross-chain aggregation isn't wired up yet
 * (only Wallets + Gas Station were in Phase 5 scope), so rather than fail
 * or fabricate cross-chain figures, this reads the real on-chain Arc balance
 * directly via viem and omits the other chains entirely until Gateway is
 * properly integrated — no CCTP bridging option shown, only what's real.
 */
export async function getGatewayBalances(address: Address): Promise<ChainBalance[]> {
  if (!MOCK_MODE) {
    const balanceWei = await publicClient.getBalance({ address });
    return [
      {
        chain: "arc-testnet",
        chainLabel: "Arc Testnet",
        balance: Number(formatUnits(balanceWei, 18)),
      },
    ];
  }

  await delay(400);
  const ledger = readLedger();
  const balancesForAddress = ledger.balances[address] ?? {};

  return GATEWAY_SUPPORTED_CHAINS.map(({ chain, chainLabel }) => ({
    chain,
    chainLabel,
    balance: balancesForAddress[chain] ?? 0,
  }));
}

export interface CctpDepositParams {
  address: Address;
  sourceChain: string;
  amount: number;
}

/**
 * Simulates a CCTP V2 burn-and-mint from a source testnet into Arc. Mock mode
 * credits the local ledger's Arc balance by exactly the amount the user requested —
 * never a fixed or randomized figure.
 */
export async function initiateCctpDeposit(params: CctpDepositParams): Promise<{ hash: `0x${string}` }> {
  if (!MOCK_MODE) {
    throw new Error("CCTP relay is not wired up yet — see SETUP.md for the Circle console configuration required.");
  }
  if (params.amount <= 0) {
    throw new Error("Deposit amount must be greater than zero.");
  }

  await delay(1400); // burn-and-mint has real cross-chain latency; mock mirrors that

  const ledger = readLedger();
  ledger.balances[params.address] ??= {};
  ledger.balances[params.address]["arc-testnet"] =
    (ledger.balances[params.address]["arc-testnet"] ?? 0) + params.amount;

  const hash = fakeTxHash(`cctp:${params.address}:${params.sourceChain}:${params.amount}`);
  ledger.transactions.push({
    hash,
    kind: "cctp-deposit",
    chain: params.sourceChain,
    amount: params.amount,
    timestamp: Date.now(),
  });
  writeLedger(ledger);

  return { hash };
}

export interface TransferOutParams {
  address: Address;
  to: Address;
  amount: number;
}

/**
 * Sends the user's own USDC out of their RentPact wallet to any address —
 * reuses the exact same gasless contract-execution mechanism already proven
 * working for escrow deposits (an ERC-20 transfer() call on the native USDC
 * wrapper), rather than a separate, unverified Circle "simple transfer" API.
 */
export async function transferOut(params: TransferOutParams): Promise<{ hash: `0x${string}` }> {
  if (params.amount <= 0) throw new Error("Enter an amount greater than zero.");

  if (!MOCK_MODE) {
    if (!usdcAddress) throw new Error("USDC contract address is not configured.");
    return sendGaslessTransaction({
      from: params.address,
      to: usdcAddress,
      data: encodeTransfer(params.to, toBaseUnits(params.amount)),
      description: `transfer ${params.amount} USDC to ${params.to}`,
    });
  }

  await delay(900);

  const ledger = readLedger();
  const currentBalance = ledger.balances[params.address]?.["arc-testnet"] ?? 0;
  if (currentBalance < params.amount) throw new Error("Insufficient balance.");

  ledger.balances[params.address]["arc-testnet"] = currentBalance - params.amount;
  ledger.balances[params.to] ??= {};
  ledger.balances[params.to]["arc-testnet"] = (ledger.balances[params.to]["arc-testnet"] ?? 0) + params.amount;

  const hash = fakeTxHash(`transfer-out:${params.address}:${params.to}:${params.amount}`);
  ledger.transactions.push({
    hash,
    kind: "gasless-call",
    chain: "arc-testnet",
    amount: params.amount,
    timestamp: Date.now(),
  });
  writeLedger(ledger);

  return { hash };
}

export function getMockTransactionHistory(): MockTransaction[] {
  return readLedger().transactions.sort((a, b) => b.timestamp - a.timestamp);
}
