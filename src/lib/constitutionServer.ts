import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * The RentPact Constitution — the binding rules document every lease
 * records acceptance of. Its hash is computed from the real file on disk
 * (never hardcoded), so it can never drift from the actual published text.
 * As of v1.1 this hash is also recorded immutably by the RentPactEscrow
 * contract at deployment (constitutionHash()) — see Article VIII.5. v1.2
 * moves the caution fee into that same contract escrow (Article 6.5–6.7).
 */

export const CONSTITUTION_VERSION = "1.3";

const FILE_PATH = path.join(process.cwd(), "public", "legal", "constitution-v1.md");

let cached: { text: string; hash: string } | null = null;

export async function getConstitution(): Promise<{ version: string; text: string; hash: string }> {
  if (!cached) {
    const text = await fs.readFile(FILE_PATH, "utf-8");
    const hash = crypto.createHash("sha256").update(text, "utf-8").digest("hex");
    cached = { text, hash };
  }
  return { version: CONSTITUTION_VERSION, ...cached };
}
