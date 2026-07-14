import "server-only";

/**
 * Server-only Circle Web3 Services REST client. NEVER import this from a
 * client component — CIRCLE_API_KEY must never reach the browser bundle.
 * Endpoint shapes verified against developers.circle.com's published
 * OpenAPI specs (user-controlled-wallets.yaml) as of this writing:
 *   POST /v1/w3s/users
 *   POST /v1/w3s/users/token
 *   POST /v1/w3s/user/initialize
 *   GET  /v1/w3s/wallets
 *   POST /v1/w3s/user/transactions/contractExecution
 *   GET  /v1/w3s/transactions/{id}
 */

const CIRCLE_API_BASE = "https://api.circle.com/v1/w3s";

function requireApiKey(): string {
  const key = process.env.CIRCLE_API_KEY;
  if (!key) throw new Error("CIRCLE_API_KEY is not set — see SETUP.md.");
  return key;
}

async function circleFetch(path: string, init: RequestInit & { userToken?: string }) {
  const { userToken, ...rest } = init;
  const res = await fetch(`${CIRCLE_API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireApiKey()}`,
      ...(userToken ? { "X-User-Token": userToken } : {}),
      ...rest.headers,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.message ?? `Circle API error (${res.status})`;
    throw new Error(message);
  }
  return json;
}

export async function circleCreateUser(userId: string) {
  return circleFetch("/users", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function circleCreateUserToken(userId: string) {
  return circleFetch("/users/token", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function circleInitializeWallet(params: {
  userToken: string;
  idempotencyKey: string;
  blockchains: string[];
}) {
  return circleFetch("/user/initialize", {
    method: "POST",
    userToken: params.userToken,
    body: JSON.stringify({
      idempotencyKey: params.idempotencyKey,
      accountType: "SCA",
      blockchains: params.blockchains,
    }),
  });
}

export async function circleListWallets(userToken: string) {
  return circleFetch("/wallets", { method: "GET", userToken });
}

export async function circleCreateContractExecutionTransaction(params: {
  userToken: string;
  idempotencyKey: string;
  walletId: string;
  contractAddress: string;
  // Mutually exclusive per Circle's API: either an ABI-described call, or raw callData.
  abiFunctionSignature?: string;
  abiParameters?: unknown[];
  callData?: string;
  feeLevel?: "LOW" | "MEDIUM" | "HIGH";
}) {
  return circleFetch("/user/transactions/contractExecution", {
    method: "POST",
    userToken: params.userToken,
    body: JSON.stringify({
      idempotencyKey: params.idempotencyKey,
      walletId: params.walletId,
      contractAddress: params.contractAddress,
      ...(params.abiFunctionSignature
        ? { abiFunctionSignature: params.abiFunctionSignature, abiParameters: params.abiParameters ?? [] }
        : { callData: params.callData }),
      feeLevel: params.feeLevel ?? "MEDIUM",
    }),
  });
}

export async function circleGetTransaction(userToken: string, id: string) {
  return circleFetch(`/transactions/${id}`, { method: "GET", userToken });
}

export async function circleListTransactions(userToken: string, walletId: string) {
  return circleFetch(`/transactions?walletIds=${encodeURIComponent(walletId)}&order=DESC`, {
    method: "GET",
    userToken,
  });
}
