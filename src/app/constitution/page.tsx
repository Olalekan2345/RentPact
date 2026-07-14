import { AppShell } from "@/components/AppShell";
import { ConstitutionDocument } from "@/components/ConstitutionDocument";
import { getConstitution } from "@/lib/constitutionServer";

export const metadata = {
  title: "The RentPact Constitution",
};

export default async function ConstitutionPage() {
  const { text, hash, version } = await getConstitution();

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <div className="rounded-lg border border-gold-200 bg-gold-50 px-5 py-4 text-sm text-gold-700">
          <p className="font-semibold">Implementation status</p>
          <p className="mt-1">
            Articles I–IV are enforced today as written, including ratio-split settlement,
            arbitration, and the ruling-deadline fallback (4.3, 4.4), with one exception: the
            security deposit (1.6, 6.2) is disclosed and tracked but not yet held in contract
            escrow — the platform&apos;s binding target, marked wherever it appears in the product
            until a contract upgrade closes the gap. See Article VIII.4–8.5 below.
          </p>
        </div>

        <div className="mt-8">
          <ConstitutionDocument markdown={text} />
        </div>

        <div className="mt-10 rounded-md bg-cream-300 px-4 py-3 text-xs text-ink-soft">
          <p>
            Version {version} · SHA-256:{" "}
            <span className="break-all font-mono">{hash}</span>
          </p>
          <p className="mt-1">
            This hash is computed directly from the document above and recorded against every
            lease at the moment it&apos;s created.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
