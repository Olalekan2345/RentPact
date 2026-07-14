"use client";

export async function exportAccountData(email: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/account/export?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Could not export your data.");
  return res.json();
}

export async function deleteAccount(email: string): Promise<void> {
  const res = await fetch(`/api/account?email=${encodeURIComponent(email)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Could not delete your account.");
}
