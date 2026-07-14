"use client";

export interface PrivacyPrefs {
  showReputation: boolean;
  showRentalHistory: boolean;
  showReviews: boolean;
}

export async function fetchPrivacyPrefs(email: string): Promise<PrivacyPrefs | null> {
  const res = await fetch(`/api/privacy?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.prefs ?? null;
}

export async function updatePrivacyPrefs(email: string, updates: Partial<PrivacyPrefs>): Promise<PrivacyPrefs> {
  const res = await fetch("/api/privacy", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...updates }),
  });
  const json = await res.json();
  return json.prefs;
}
