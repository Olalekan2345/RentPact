"use client";

import { useMemo, useState } from "react";
import { EscrowTimeline, type EscrowTimelineNodeData, type ReleaseFrequency } from "@/components/escrow";
import { SegmentedControl } from "@/components/ui";
import { FREQUENCY_OPTIONS, INTERVAL_DAYS } from "@/lib/contracts/frequency";

const PREVIEW_CONFIG: Record<ReleaseFrequency, { periods: number; released: number; amount: number }> = {
  monthly: { periods: 12, released: 3, amount: 450 },
  quarterly: { periods: 4, released: 1, amount: 1350 },
  yearly: { periods: 2, released: 0, amount: 5400 },
  daily: { periods: 7, released: 2, amount: 60 },
  hourly: { periods: 12, released: 3, amount: 15 },
};

export function LandingTimelinePreview() {
  const [frequency, setFrequency] = useState<ReleaseFrequency>("monthly");

  const nodes: EscrowTimelineNodeData[] = useMemo(() => {
    const { periods, released, amount } = PREVIEW_CONFIG[frequency];
    const start = new Date();
    const intervalMs = INTERVAL_DAYS[frequency] * 24 * 60 * 60 * 1000;

    return Array.from({ length: periods }, (_, i) => ({
      period: i + 1,
      status: i < released ? "released" : "upcoming",
      releaseDate: new Date(start.getTime() + i * intervalMs),
      amount,
    }));
  }, [frequency]);

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        name="landing-frequency-preview"
        options={FREQUENCY_OPTIONS}
        value={frequency}
        onChange={setFrequency}
      />
      <EscrowTimeline frequency={frequency} nodes={nodes} />
    </div>
  );
}
