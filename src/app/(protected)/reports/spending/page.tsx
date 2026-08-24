"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StatementDocument } from "@/components/statement/StatementDocument";
import { buildStatement } from "@/lib/statement";
import { getActivityFeed, listLeasesForTenant, type ActivityItem, type Lease } from "@/lib/leaseData";

export default function SpendingReportPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [releases, setReleases] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    listLeasesForTenant(session, false).then(setLeases);
    getActivityFeed(session, 1000).then((items) => setReleases(items.filter((i) => i.type === "release")));
  }, [session]);

  const data = useMemo(() => buildStatement(leases ?? [], releases ?? []), [leases, releases]);

  if (isLoading || !session) return null;

  return (
    <StatementDocument
      variant="spending"
      email={session.email}
      data={data}
      loading={leases === null || releases === null}
    />
  );
}
