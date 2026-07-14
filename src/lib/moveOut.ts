"use client";

import { sha256Hex } from "@/lib/condition";

export interface MoveOutPhoto {
  room: string;
  url: string;
  hash: string;
}

export interface MoveOutCondition {
  leaseId: string;
  submittedBy: string;
  notes: string;
  photos: MoveOutPhoto[];
  declaredAt: number;
  hash: string;
}

export async function fetchMoveOutCondition(leaseId: string): Promise<MoveOutCondition | null> {
  const res = await fetch(`/api/move-out?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.record ?? null;
}

export async function submitMoveOutCondition(input: {
  leaseId: string;
  submittedBy: string;
  notes: string;
  photos: MoveOutPhoto[];
}): Promise<MoveOutCondition> {
  const declaredAt = Date.now();
  const canonical = JSON.stringify({
    notes: input.notes,
    photos: [...input.photos].map((p) => ({ room: p.room, hash: p.hash })).sort((a, b) => (a.room + a.hash).localeCompare(b.room + b.hash)),
    declaredAt,
  });
  const hash = await sha256Hex(canonical);

  const res = await fetch("/api/move-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, declaredAt, hash }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not submit move-out condition.");
  }
  const json = await res.json();
  return json.record;
}
