"use client";

/**
 * Thin client wrapper around @circle-fin/w3s-pw-web-sdk. Loaded lazily so the
 * SDK (and its WebAuthn/PIN UI) only initializes in real mode, in the browser.
 */

export interface ChallengeResult {
  type: string;
  status: string;
  data?: { signature?: string; walletId?: string };
}

export async function executeCircleChallenge(params: {
  appId: string;
  userToken: string;
  encryptionKey: string;
  challengeId: string;
}): Promise<ChallengeResult> {
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

  const sdk = new W3SSdk({ appSettings: { appId: params.appId } });
  sdk.setAuthentication({ userToken: params.userToken, encryptionKey: params.encryptionKey });

  return new Promise((resolve, reject) => {
    sdk.execute(params.challengeId, (error: unknown, result: unknown) => {
      if (error) {
        console.error("[circleSdk] challenge execution error", error);
        if (error instanceof Error) {
          reject(error);
        } else if (typeof error === "object" && error !== null) {
          const { code, message } = error as { code?: unknown; message?: unknown };
          reject(new Error(`Circle SDK error${code ? ` (${code})` : ""}: ${message ?? JSON.stringify(error)}`));
        } else {
          reject(new Error(String(error)));
        }
        return;
      }
      resolve(result as ChallengeResult);
    });
  });
}
