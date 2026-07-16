"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, CardContent } from "@/components/ui";
import { exportAccountData, deleteAccount } from "@/lib/account";

export default function LegalSettingsPage() {
  const { session, isLoading, signOut } = useAuth();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  if (isLoading || !session) return null;

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await exportAccountData(session.email);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rentpact-data-${session.email}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(session.email);
      await signOut();
      window.location.assign("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete your account.");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 text-sm text-ink-muted">
          <p className="font-medium text-ink">How RentPact escrow works</p>
          <p>
            When you deposit into a lease, your USDC moves into the RentPactEscrow smart contract on Arc
            testnet — not into the landlord&apos;s wallet directly. Funds release to the landlord in tranches
            as each rental period elapses, gaslessly, via Circle&apos;s Gas Station.
          </p>
          <p className="font-medium text-ink">Disputes</p>
          <p>
            A tenant can freeze the next scheduled release by raising a dispute with a reason. That reason and
            the timeline are recorded and visible to both parties in the lease&apos;s message thread. A dispute
            is resolved by the contract&apos;s arbiter, who decides whether the frozen tranche releases to the
            landlord or refunds to the tenant.
          </p>
          <p className="font-medium text-ink">Disclosed vs. undisclosed issues</p>
          <p>
            Anything a landlord discloses in a listing&apos;s Property Condition Declaration before you rent
            (known defects, area-by-area condition) is something you accept by depositing. Anything genuinely
            undisclosed that later breaks is legitimate grounds for a dispute.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <p className="text-sm font-medium text-ink">Export your data</p>
            <p className="mt-1 text-xs text-ink-soft">
              Downloads a JSON file of your profile, listings, messages, reviews received, and preferences.
            </p>
          </div>
          {exportError && <p className="text-sm text-terracotta-500">{exportError}</p>}
          <Button variant="secondary" size="sm" className="w-fit" onClick={handleExport} disabled={exporting}>
            {exporting ? "Preparing…" : "Download my data"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <p className="text-sm font-medium text-terracotta-600">Delete account</p>
            <p className="mt-1 text-xs text-ink-soft">
              Removes your profile name/photo, preferences, and takes any active listings down. Lease and
              message history stays intact — this is an escrow platform, and deleting shared financial records
              would corrupt the other party&apos;s record of a real transaction.
            </p>
          </div>
          {deleteError && <p className="text-sm text-terracotta-500">{deleteError}</p>}
          {!confirmingDelete ? (
            <Button variant="destructive" size="sm" className="w-fit" onClick={() => setConfirmingDelete(true)}>
              Delete my account
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
