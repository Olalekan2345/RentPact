/**
 * Landlord & property verification — the shared vocabulary for the browser and the server
 * (see verificationServer.ts for the rules, and supabase/migrations/0013 for storage).
 */

/** "none" = never applied. */
export type LandlordVerificationStatus = "none" | "pending" | "approved" | "rejected" | "revoked";
/** "unverified" = published before verification existed; shown with a "Not yet verified" label. */
export type ListingVerificationStatus = "unverified" | "pending" | "approved" | "rejected";
export type LandlordRole = "owner" | "agent";

export type DocumentKind = "id" | "lasrera" | "title" | "bill" | "authority";

export interface VerificationDocument {
  kind: DocumentKind;
  /** Path inside the private verification-docs bucket: "<auth user id>/<file>". */
  path: string;
  /** Original file name, for the reviewer. */
  name: string;
}

export const ID_TYPES = [
  { value: "nin", label: "NIN slip or card" },
  { value: "passport", label: "International passport" },
  { value: "drivers-licence", label: "Driver's licence" },
  { value: "voters-card", label: "Permanent voter's card" },
] as const;

/** Lagos title documents that prove ownership. */
export const TITLE_DOCUMENT_TYPES = [
  { value: "c-of-o", label: "Certificate of Occupancy (C of O)" },
  { value: "governors-consent", label: "Governor's Consent" },
  { value: "deed-of-assignment", label: "Registered Deed of Assignment" },
  { value: "other", label: "Other registered title (we'll discuss it on the video call)" },
] as const;

export interface CheckItem {
  key: string;
  label: string;
  /** Only asked for when the landlord is an agent / caretaker. */
  agentOnly?: boolean;
  /** Not required to approve. */
  optional?: boolean;
}

/** What the reviewer must confirm before approving a landlord. */
export const LANDLORD_CHECKS: CheckItem[] = [
  { key: "idMatches", label: "The ID looks genuine and its name matches the application" },
  { key: "videoCall", label: "Video call done: the person matches the ID photo" },
  { key: "lasreraChecked", label: "LASRERA registration certificate checked", agentOnly: true },
];

/** What the reviewer must confirm before approving a property. */
export const PROPERTY_CHECKS: CheckItem[] = [
  {
    key: "titleNameMatches",
    label: "The name on the title document matches the landlord, or the owner named in the letter of authority",
  },
  { key: "authorityChecked", label: "Owner's signed letter of authority checked", agentOnly: true },
  { key: "billMatchesAddress", label: "The bill shows this exact property address" },
  { key: "videoWalkthrough", label: "Live video walk-through of the property done" },
  { key: "registrySearch", label: "Lands Registry search done (for high-value or doubtful cases)", optional: true },
];

/** How tenants see each completed property check under "Verified by RentPact". */
export const PUBLIC_CHECK_LABELS: Record<string, string> = {
  titleNameMatches: "Ownership documents",
  authorityChecked: "Owner's authority to let",
  billMatchesAddress: "Proof of address",
  videoWalkthrough: "Live video walk-through",
  registrySearch: "Lands Registry search",
};

export function requiredChecks(items: CheckItem[], role: LandlordRole | null): string[] {
  return items.filter((c) => !c.optional && (!c.agentOnly || role === "agent")).map((c) => c.key);
}

/** Documents are deleted this many days after a decision; the record of what was checked stays. */
export const DOCUMENT_RETENTION_DAYS = 30;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Public view of one listing's verification, safe to show anyone. */
export interface ListingVerificationSummary {
  status: ListingVerificationStatus;
  verifiedAt: number | null;
  /** Labels of the checks that were done, e.g. ["Ownership documents", "Live video walk-through"]. */
  checked: string[];
  /** Why it was rejected — only sent to the listing's own landlord. */
  note?: string | null;
}
