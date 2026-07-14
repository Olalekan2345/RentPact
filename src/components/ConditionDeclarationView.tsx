"use client";

import { Badge, Card, CardContent } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { CONDITION_AREAS, type ConditionDeclaration, type ConditionStatus, type Responsibility } from "@/lib/condition";

const STATUS_BADGE: Record<ConditionStatus, { label: string; variant: "forest" | "gold" | "terracotta" }> = {
  working: { label: "Working", variant: "forest" },
  partial: { label: "Partial", variant: "gold" },
  "known-issue": { label: "Known issue", variant: "terracotta" },
};

const RESPONSIBILITY_LABEL: Record<Responsibility, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
  shared: "Shared",
};

export function ConditionDeclarationView({ condition }: { condition: ConditionDeclaration }) {
  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Property condition declaration</h2>
          <span className="shrink-0 text-xs text-ink-soft">
            Declared {formatDate(new Date(condition.declaredAt))}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Disclosed here — accepted on rent. Anything not disclosed that later breaks is legitimate
          dispute grounds.
        </p>

        <div className="mt-4 flex flex-col gap-3 border-t border-forest-100 pt-4">
          {CONDITION_AREAS.map((area) => {
            const value = condition.areas[area.key];
            if (!value) return null;
            const badge = STATUS_BADGE[value.status];
            return (
              <div key={area.key} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{area.label}</p>
                  {value.notes && <p className="text-xs text-ink-soft">{value.notes}</p>}
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Responsible: {RESPONSIBILITY_LABEL[value.responsibility]}
                  </p>
                </div>
                <Badge variant={badge.variant} className="shrink-0">
                  {badge.label}
                </Badge>
              </div>
            );
          })}
        </div>

        {condition.knownDefects && (
          <div className="mt-4 rounded-md border border-terracotta-100 bg-terracotta-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
              Known defects
            </p>
            <p className="mt-1 text-sm text-ink-muted">{condition.knownDefects}</p>
          </div>
        )}

        <div className="mt-4 grid gap-3 border-t border-forest-100 pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Landlord handles</p>
            <p className="mt-1 text-ink-muted">{condition.maintenanceLandlord}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Tenant handles</p>
            <p className="mt-1 text-ink-muted">{condition.maintenanceTenant}</p>
          </div>
        </div>

        {condition.photos.length > 0 && (
          <div className="mt-4 border-t border-forest-100 pt-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Baseline photos</p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {condition.photos.map((photo, i) => (
                <div key={i} className="overflow-hidden rounded-md border border-forest-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.room} className="h-20 w-full object-cover" />
                  <p className="truncate bg-cream-400 px-1.5 py-1 text-[11px] text-ink-muted">{photo.room}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {condition.videoUrl && (
          <div className="mt-4 border-t border-forest-100 pt-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Walkthrough video</p>
            {condition.videoUrl.startsWith("data:") ? (
              <video src={condition.videoUrl} controls className="mt-2 w-full rounded-md" />
            ) : (
              <a href={condition.videoUrl} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-forest-500 underline">
                Watch walkthrough video →
              </a>
            )}
          </div>
        )}

        <p className="mt-4 truncate font-mono text-[11px] text-ink-soft" title={condition.hash}>
          Declaration hash: {condition.hash.slice(0, 16)}…{condition.hash.slice(-8)}
        </p>
      </CardContent>
    </Card>
  );
}
