"use client";

/**
 * Thin client wrapper around @circle-fin/w3s-pw-web-sdk. Loaded lazily so the
 * SDK (and its WebAuthn/PIN UI) only initializes in real mode, in the browser.
 *
 * Two things here specifically fight the intermittent 155706 "Network error"
 * that shows (mostly on desktop) when the wallet/approval UI is slow to appear:
 *   1. The sizeable SDK bundle is imported once and the W3SSdk instance reused,
 *      so a challenge never pays the cold import + fresh-construct cost on the
 *      critical path (preloadCircleSdk() warms it ahead of time).
 *   2. A transient 155706 is retried a couple of times before it's surfaced —
 *      a network failure reaching Circle means the PIN UI never rendered, so a
 *      quick retry recovers it without the user ever seeing the error.
 */

export interface ChallengeResult {
  type: string;
  status: string;
  data?: { signature?: string; walletId?: string };
}

type W3SSdkModule = typeof import("@circle-fin/w3s-pw-web-sdk");
type W3SSdkInstance = InstanceType<W3SSdkModule["W3SSdk"]>;

// Warm the (sizeable) SDK bundle once and reuse the module promise, so the
// dynamic import is off the critical path by the time a challenge fires.
let sdkModulePromise: Promise<W3SSdkModule> | null = null;

function loadSdkModule(): Promise<W3SSdkModule> {
  if (!sdkModulePromise) {
    sdkModulePromise = import("@circle-fin/w3s-pw-web-sdk");
  }
  return sdkModulePromise;
}

/**
 * Kick off the SDK bundle download ahead of time (e.g. right after sign-in) so
 * the first wallet/transaction challenge doesn't pay the cold-import cost — the
 * main reason desktop intermittently throws a 155706 "Network error" before
 * recovering. Fire-and-forget and safe to call repeatedly; it imports once.
 */
export function preloadCircleSdk(): void {
  void loadSdkModule().catch(() => {
    sdkModulePromise = null; // let a later call retry the import
  });
}

// One SDK instance per appId — reconstructing it per challenge re-runs its
// internal init/network setup, which is part of what races into a 155706.
let cachedSdk: { appId: string; sdk: W3SSdkInstance } | null = null;

async function getSdk(appId: string): Promise<W3SSdkInstance> {
  const { W3SSdk } = await loadSdkModule();
  if (!cachedSdk || cachedSdk.appId !== appId) {
    cachedSdk = { appId, sdk: new W3SSdk({ appSettings: { appId } }) };
  }
  return cachedSdk.sdk;
}

/**
 * 155706 is the W3S SDK's "Network error" — a transient failure to reach Circle
 * while initializing the challenge UI. It clears on a quick retry, and because
 * the PIN UI never renders when it fires, retrying can't stack a second dialog.
 */
function isTransientNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 155706 || (typeof message === "string" && /network error/i.test(message));
}

function runChallenge(sdk: W3SSdkInstance, challengeId: string): Promise<ChallengeResult> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error: unknown, result: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result as ChallengeResult);
    });
  });
}

export async function executeCircleChallenge(params: {
  appId: string;
  userToken: string;
  encryptionKey: string;
  challengeId: string;
}): Promise<ChallengeResult> {
  const sdk = await getSdk(params.appId);
  sdk.setAuthentication({ userToken: params.userToken, encryptionKey: params.encryptionKey });

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await runChallenge(sdk, params.challengeId);
    } catch (error) {
      lastError = error;
      // Only the transient network error is retryable; a wrong PIN or a user
      // cancel is final and must surface immediately.
      if (isTransientNetworkError(error) && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  console.error("[circleSdk] challenge execution error", lastError);
  if (lastError instanceof Error) {
    throw lastError;
  }
  if (typeof lastError === "object" && lastError !== null) {
    const { code, message } = lastError as { code?: unknown; message?: unknown };
    throw new Error(`Circle SDK error${code ? ` (${code})` : ""}: ${message ?? JSON.stringify(lastError)}`);
  }
  throw new Error(String(lastError));
}
