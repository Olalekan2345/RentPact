"use client";

export interface UserProfile {
  email: string;
  name: string | null;
  photoUrl: string | null;
  memberSince: number;
}

export async function fetchProfile(email: string): Promise<UserProfile | null> {
  const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.profile ?? null;
}

export async function updateProfile(email: string, updates: { name?: string | null; photoUrl?: string | null }): Promise<UserProfile> {
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...updates }),
  });
  if (!res.ok) throw new Error("Could not update profile.");
  const json = await res.json();
  return json.profile;
}
