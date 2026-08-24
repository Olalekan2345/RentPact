"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StatementTab } from "@/components/statement/StatementTab";
import { getActivityFeed, listLeasesForTenant, type ActivityItem, type Lease } from "@/lib/leaseData";

export default function SpendingPage() {
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

  if (isLoading || !session) return null;

  return <StatementTab variant="spending" email={session.email} leases={leases} releases={releases} />;
}
