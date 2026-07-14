/**
 * Property Condition Declaration — the landlord's disclosed state of the
 * property at listing time. Anything declared here (working/partial/known
 * issue, known defects) is what the tenant accepts by renting; anything NOT
 * disclosed that later breaks is legitimate dispute grounds.
 *
 * Hashed and timestamped off-chain: the escrow contract is already deployed
 * and in use by real testers, so this declaration is not stored on-chain.
 * Instead its content hash is computed here (SHA-256 over a canonical
 * representation) and persisted alongside the listing/lease record — any
 * edit to a declared field changes the hash, making tampering after the
 * fact detectable even without a contract change.
 */

export type ConditionStatus = "working" | "partial" | "known-issue";

/** Article 2.5 — who's responsible for this area under the Maintenance Responsibility Matrix. */
export type Responsibility = "landlord" | "tenant" | "shared";

export interface ConditionArea {
  status: ConditionStatus;
  notes: string;
  responsibility: Responsibility;
}

export const CONDITION_AREAS = [
  { key: "plumbing", label: "Plumbing", helper: "Taps, toilets, water heater, pressure", defaultResponsibility: "landlord" },
  { key: "electrical", label: "Electrical", helper: "Sockets, lighting, meter, prepaid/postpaid", defaultResponsibility: "landlord" },
  { key: "structure", label: "Walls, ceilings & floors", helper: "Overall condition", defaultResponsibility: "landlord" },
  { key: "security", label: "Doors, locks & windows", helper: "Security fittings", defaultResponsibility: "landlord" },
  { key: "fittings", label: "Kitchen fittings & wardrobes", helper: "Fixtures included", defaultResponsibility: "shared" },
  { key: "waterSupply", label: "Water supply", helper: "Borehole/mains, availability schedule if not 24/7", defaultResponsibility: "landlord" },
  { key: "power", label: "Power situation", helper: "NEPA hours, generator/inverter included?", defaultResponsibility: "landlord" },
] as const satisfies { key: string; label: string; helper: string; defaultResponsibility: Responsibility }[];

export type ConditionAreaKey = (typeof CONDITION_AREAS)[number]["key"];

export const CONDITION_STATUS_OPTIONS: { value: ConditionStatus; label: string }[] = [
  { value: "working", label: "Working" },
  { value: "partial", label: "Partial" },
  { value: "known-issue", label: "Known issue" },
];

export const RESPONSIBILITY_OPTIONS: { value: Responsibility; label: string }[] = [
  { value: "landlord", label: "Landlord" },
  { value: "tenant", label: "Tenant" },
  { value: "shared", label: "Shared" },
];

export interface RoomPhoto {
  room: string;
  url: string;
  hash: string;
}

export interface ConditionDeclaration {
  areas: Record<ConditionAreaKey, ConditionArea>;
  knownDefects: string;
  maintenanceLandlord: string;
  maintenanceTenant: string;
  photos: RoomPhoto[];
  videoUrl: string | null;
  declaredAt: number;
  hash: string;
}

export const DEFAULT_MAINTENANCE_LANDLORD =
  "Structural repairs, plumbing mains, electrical wiring, roof and major systems.";
export const DEFAULT_MAINTENANCE_TENANT =
  "Bulbs and minor fittings, damage the tenant causes, day-to-day upkeep.";

export function emptyConditionAreas(): Record<ConditionAreaKey, ConditionArea> {
  return Object.fromEntries(
    CONDITION_AREAS.map((a) => [
      a.key,
      { status: "working" as ConditionStatus, notes: "", responsibility: a.defaultResponsibility as Responsibility },
    ]),
  ) as Record<ConditionAreaKey, ConditionArea>;
}

export async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashDeclaration(input: Omit<ConditionDeclaration, "hash">): Promise<string> {
  const canonical = JSON.stringify({
    areas: Object.fromEntries(Object.entries(input.areas).sort(([a], [b]) => a.localeCompare(b))),
    knownDefects: input.knownDefects,
    maintenanceLandlord: input.maintenanceLandlord,
    maintenanceTenant: input.maintenanceTenant,
    photos: [...input.photos].map((p) => ({ room: p.room, hash: p.hash })).sort((a, b) => (a.room + a.hash).localeCompare(b.room + b.hash)),
    videoUrl: input.videoUrl,
    declaredAt: input.declaredAt,
  });
  return sha256Hex(canonical);
}
