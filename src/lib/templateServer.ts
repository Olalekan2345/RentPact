import "server-only";
import type { ReleaseFrequency } from "@/components/escrow";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profileServer";

/**
 * Saved lease templates — for a landlord with multiple identical units
 * (e.g. several rooms in the same building), reusable terms/type/amenities/
 * rules without re-entering them per listing. Deliberately excludes
 * propertyAddress and photos, which are unit-specific.
 */

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

function fromRow(row: {
  id: string;
  landlord_email: string;
  name: string;
  property_type: string;
  amenities: string[];
  amount_per_period: number;
  total_periods: number;
  frequency: string;
  security_deposit: number | null;
  house_rules: string;
  notice_period_days: number | null;
  maintenance_landlord: string;
  maintenance_tenant: string;
  created_at: number;
}): LeaseTemplate {
  return {
    id: row.id,
    landlordEmail: row.landlord_email,
    name: row.name,
    propertyType: row.property_type,
    amenities: row.amenities,
    amountPerPeriod: row.amount_per_period,
    totalPeriods: row.total_periods,
    frequency: row.frequency as ReleaseFrequency,
    securityDeposit: row.security_deposit,
    houseRules: row.house_rules,
    noticePeriodDays: row.notice_period_days,
    maintenanceLandlord: row.maintenance_landlord,
    maintenanceTenant: row.maintenance_tenant,
    createdAt: row.created_at,
  };
}

export async function listTemplatesForLandlord(landlordEmail: string): Promise<LeaseTemplate[]> {
  const normalized = landlordEmail.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("templates")
    .select()
    .eq("landlord_email", normalized)
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromRow);
}

export async function createTemplate(input: Omit<LeaseTemplate, "id" | "createdAt">): Promise<LeaseTemplate> {
  await ensureProfile(input.landlordEmail);

  const template: LeaseTemplate = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };

  const { error } = await supabaseAdmin()
    .from("templates")
    .insert({
      id: template.id,
      landlord_email: template.landlordEmail,
      name: template.name,
      property_type: template.propertyType,
      amenities: template.amenities,
      amount_per_period: template.amountPerPeriod,
      total_periods: template.totalPeriods,
      frequency: template.frequency,
      security_deposit: template.securityDeposit,
      house_rules: template.houseRules,
      notice_period_days: template.noticePeriodDays,
      maintenance_landlord: template.maintenanceLandlord,
      maintenance_tenant: template.maintenanceTenant,
      created_at: template.createdAt,
    });
  if (error) throw error;

  return template;
}

export async function deleteTemplate(id: string, landlordEmail: string): Promise<void> {
  const normalized = landlordEmail.trim().toLowerCase();
  await supabaseAdmin().from("templates").delete().eq("id", id).eq("landlord_email", normalized);
}
