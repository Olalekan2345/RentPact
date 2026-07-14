import type { RoomPhoto } from "@/lib/condition";
import type { MoveOutPhoto } from "@/lib/moveOut";
import { Card, CardContent } from "@/components/ui";

function normalizeRoom(room: string): string {
  return room.trim().toLowerCase();
}

/**
 * Section 4c — the baseline-vs-exit comparison a damage claim's evidence
 * links into (Article 6.1, 6.6). Baseline and move-out photos are both
 * keyed by free-text room labels rather than a structured area ID, so
 * pairing is a best-effort case-insensitive match; anything that doesn't
 * match on either side still gets shown, just not side by side.
 */
export function MoveOutComparison({
  baselinePhotos,
  moveOutPhotos,
}: {
  baselinePhotos: RoomPhoto[];
  moveOutPhotos: MoveOutPhoto[];
}) {
  const moveOutByRoom = new Map<string, MoveOutPhoto[]>();
  for (const p of moveOutPhotos) {
    const key = normalizeRoom(p.room);
    moveOutByRoom.set(key, [...(moveOutByRoom.get(key) ?? []), p]);
  }

  const matchedRooms = new Set<string>();
  const pairs: { room: string; baseline: RoomPhoto; moveOut: MoveOutPhoto }[] = [];
  for (const baseline of baselinePhotos) {
    const key = normalizeRoom(baseline.room);
    const candidates = moveOutByRoom.get(key);
    if (candidates && candidates.length > 0) {
      pairs.push({ room: baseline.room, baseline, moveOut: candidates[0] });
      matchedRooms.add(key);
    }
  }

  const unmatchedBaseline = baselinePhotos.filter((p) => !matchedRooms.has(normalizeRoom(p.room)));
  const unmatchedMoveOut = moveOutPhotos.filter((p) => !matchedRooms.has(normalizeRoom(p.room)));

  if (pairs.length === 0 && unmatchedBaseline.length === 0 && unmatchedMoveOut.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold text-ink">Move-in vs. move-out</h2>
        <p className="mt-1 text-xs text-ink-soft">
          The comparison a damage claim is evidenced against — matched by room name where possible.
        </p>

        {pairs.length > 0 && (
          <div className="mt-4 flex flex-col gap-4">
            {pairs.map(({ room, baseline, moveOut }, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <div className="overflow-hidden rounded-md border border-forest-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={baseline.url} alt={`${room} — move-in`} className="h-28 w-full object-cover" />
                  <p className="truncate bg-cream-400 px-1.5 py-1 text-[11px] text-ink-muted">{room} · move-in</p>
                </div>
                <div className="overflow-hidden rounded-md border border-terracotta-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={moveOut.url} alt={`${room} — move-out`} className="h-28 w-full object-cover" />
                  <p className="truncate bg-terracotta-50 px-1.5 py-1 text-[11px] text-terracotta-600">
                    {room} · move-out
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {(unmatchedBaseline.length > 0 || unmatchedMoveOut.length > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            {unmatchedBaseline.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Move-in only
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {unmatchedBaseline.map((p, i) => (
                    <div key={i} className="overflow-hidden rounded-md border border-forest-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.room} className="h-20 w-full object-cover" />
                      <p className="truncate bg-cream-400 px-1.5 py-1 text-[11px] text-ink-muted">{p.room}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {unmatchedMoveOut.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Move-out only
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {unmatchedMoveOut.map((p, i) => (
                    <div key={i} className="overflow-hidden rounded-md border border-terracotta-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.room} className="h-20 w-full object-cover" />
                      <p className="truncate bg-terracotta-50 px-1.5 py-1 text-[11px] text-terracotta-600">
                        {p.room}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
