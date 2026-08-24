"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Spending is now a view within the combined Earnings & Spending tab. This
 * route is kept as a redirect so old links (and the spending PDF's back link)
 * land on the combined tab with the Spending view preselected.
 */
export default function SpendingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/wallet/earnings?view=spending");
  }, [router]);
  return null;
}
