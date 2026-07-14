import {
  EscrowTimeline,
  type EscrowTimelineNodeData,
  type ReleaseFrequency,
} from "@/components/escrow/EscrowTimeline";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";

const INTERVAL_DAYS: Record<ReleaseFrequency, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
  daily: 1,
  hourly: 1 / 24,
};

function buildDemoNodes(
  frequency: ReleaseFrequency,
  totalPeriods: number,
  releasedCount: number,
  amount: number,
  frozenAtPeriod?: number,
): EscrowTimelineNodeData[] {
  const start = new Date();
  const intervalMs = INTERVAL_DAYS[frequency] * 24 * 60 * 60 * 1000;

  return Array.from({ length: totalPeriods }, (_, i) => {
    const period = i + 1;
    const status =
      frozenAtPeriod === period ? "frozen" : period <= releasedCount ? "released" : "upcoming";
    return {
      period,
      status,
      releaseDate: new Date(start.getTime() + i * intervalMs),
      amount,
    };
  });
}

export default function TimelinePreviewPage() {
  const monthly = buildDemoNodes("monthly", 24, 6, 450, 7);
  const quarterly = buildDemoNodes("quarterly", 4, 1, 1200);
  const yearly = buildDemoNodes("yearly", 2, 0, 5000, 1);
  const allReleased = buildDemoNodes("quarterly", 4, 4, 900);
  const allUpcoming = buildDemoNodes("yearly", 3, 0, 3000);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 bg-cream p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-forest-400">
          Component preview — dev only
        </p>
        <h1 className="mt-1 text-3xl text-ink">EscrowTimeline</h1>
        <p className="mt-2 text-ink-soft">
          Isolated, prop-driven preview across all three frequencies and node states.
          Illustrative data generated at render time — not real lease data.
        </p>
      </div>

      <section className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly — 24 periods, frozen mid-way</CardTitle>
          </CardHeader>
          <CardContent>
            <EscrowTimeline frequency="monthly" nodes={monthly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quarterly — 4 periods</CardTitle>
          </CardHeader>
          <CardContent>
            <EscrowTimeline frequency="quarterly" nodes={quarterly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yearly — 2 periods, frozen first</CardTitle>
          </CardHeader>
          <CardContent>
            <EscrowTimeline frequency="yearly" nodes={yearly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All released (quarterly)</CardTitle>
          </CardHeader>
          <CardContent>
            <EscrowTimeline frequency="quarterly" nodes={allReleased} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>All upcoming (yearly, 3 periods)</CardTitle>
          </CardHeader>
          <CardContent>
            <EscrowTimeline frequency="yearly" nodes={allUpcoming} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
