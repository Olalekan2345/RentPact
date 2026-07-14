"use client";

import type { ReleaseFrequency } from "@/components/escrow";

export interface LeaseTemplate {
  id: string;
  landlordEmail: string;
  name: string;
  propertyType: string;
  amenities: string[];
  amountPerPeriod: number;
  totalPeriods: number;
  frequency: ReleaseFrequency;
  securityDeposit: number | null;
  houseRules: string;
  noticePeriodDays: number | null;
  maintenanceLandlord: string;
  maintenanceTenant: string;
  createdAt: number;
}

export async function fetchTemplates(landlordEmail: string): Promise<LeaseTemplate[]> {
  const res = await fetch(`/api/templates?landlordEmail=${encodeURIComponent(landlordEmail)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.templates ?? [];
}

export async function saveTemplate(input: Omit<LeaseTemplate, "id" | "createdAt">): Promise<LeaseTemplate> {
  const res = await fetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Could not save template.");
  const json = await res.json();
  return json.template;
}

export async function deleteTemplate(id: string, landlordEmail: string): Promise<void> {
  await fetch(`/api/templates/${id}?landlordEmail=${encodeURIComponent(landlordEmail)}`, { method: "DELETE" });
}
