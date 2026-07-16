import { TenancyCredentialCard } from "@/components/TenancyCredentialCard";
import type { TenancyCredentialSummary } from "@/lib/leaseData";

const demo: TenancyCredentialSummary = {
  tokenId: 124n,
  leaseId: 12n,
  durationDays: 365,
  totalPeriods: 12,
  onTimePeriods: 12,
  disputesLost: 0,
  completionDate: new Date("2026-06-15").getTime(),
};

const demoShort: TenancyCredentialSummary = {
  tokenId: 7n,
  leaseId: 3n,
  durationDays: 90,
  totalPeriods: 3,
  onTimePeriods: 2,
  disputesLost: 1,
  completionDate: new Date("2026-03-01").getTime(),
};

export default function CredentialPreviewPage() {
  return (
    <div className="min-h-screen bg-cream px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl text-ink">Tenancy credential preview</h1>
        <p className="mt-1 text-sm text-ink-soft">Isolated /dev route — not linked from the app.</p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-soft">Full</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TenancyCredentialCard credential={demo} />
          <TenancyCredentialCard credential={demoShort} />
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-soft">Compact</h2>
        <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
          <TenancyCredentialCard credential={demo} compact />
          <TenancyCredentialCard credential={demoShort} compact />
        </div>
      </div>
    </div>
  );
}
