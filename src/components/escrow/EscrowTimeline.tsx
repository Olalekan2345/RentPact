"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatUSDC, formatDate, formatDateTime } from "@/lib/format";
import { CheckIcon, ClockIcon, FrostIcon } from "@/components/icons/TimelineIcons";
import { UsdcIcon } from "@/components/icons/UsdcIcon";

export type ReleaseFrequency = "monthly" | "quarterly" | "yearly" | "daily" | "hourly";
export type TimelineNodeStatus = "released" | "upcoming" | "frozen";

export interface EscrowTimelineNodeData {
  /** 1-based period number within the lease. */
  period: number;
  status: TimelineNodeStatus;
  releaseDate: Date;
  /** USDC amount released for this period. */
  amount: number;
}

export interface EscrowTimelineProps {
  frequency: ReleaseFrequency;
  nodes: EscrowTimelineNodeData[];
  className?: string;
}

const FREQUENCY_LABEL: Record<ReleaseFrequency, string> = {
  monthly: "Month",
  quarterly: "Quarter",
  yearly: "Year",
  daily: "Day",
  hourly: "Hour",
};

/** Daily/hourly release nodes land close enough together that a date alone is ambiguous — show time of day too. */
const SHOWS_TIME: Record<ReleaseFrequency, boolean> = {
  monthly: false,
  quarterly: false,
  yearly: false,
  daily: true,
  hourly: true,
};

type Density = "compact" | "medium" | "large";

function densityFor(count: number): Density {
  if (count > 8) return "compact";
  if (count > 3) return "medium";
  return "large";
}

const CIRCLE_SIZE: Record<Density, string> = {
  compact: "h-7 w-7",
  medium: "h-11 w-11",
  large: "h-16 w-16",
};

const ICON_SIZE: Record<Density, string> = {
  compact: "h-3.5 w-3.5",
  medium: "h-5 w-5",
  large: "h-7 w-7",
};

const GAP: Record<Density, string> = {
  compact: "gap-1",
  medium: "gap-2",
  large: "gap-3",
};

export function EscrowTimeline({ frequency, nodes, className }: EscrowTimelineProps) {
  const density = densityFor(nodes.length);
  const periodLabel = FREQUENCY_LABEL[frequency];
  const showTime = SHOWS_TIME[frequency];
  const prefersReducedMotion = useReducedMotion();

  return (
    <ol className={cn("flex flex-col", GAP[density], className)} aria-label={`${periodLabel} escrow release timeline`}>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const nextNode = nodes[i + 1];
        const lineIsGold = node.status === "released";
        const lineIsFrozen = nextNode?.status === "frozen";

        return (
          <li key={node.period} className="flex gap-4">
            {/* Rail: node circle + connecting line */}
            <div className="flex flex-col items-center">
              <TimelineNodeCircle
                status={node.status}
                density={density}
                prefersReducedMotion={!!prefersReducedMotion}
              />
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[1.25rem] rounded-full",
                    lineIsFrozen
                      ? "bg-terracotta-200"
                      : lineIsGold
                        ? "bg-gold-400"
                        : "bg-forest-100",
                  )}
                />
              )}
            </div>

            {/* Content */}
            <TimelineNodeContent
              node={node}
              density={density}
              periodLabel={periodLabel}
              isLast={isLast}
              showTime={showTime}
            />
          </li>
        );
      })}
    </ol>
  );
}

function TimelineNodeCircle({
  status,
  density,
  prefersReducedMotion,
}: {
  status: TimelineNodeStatus;
  density: Density;
  prefersReducedMotion: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        CIRCLE_SIZE[density],
        status === "released" && "bg-gold-400 text-forest-900 shadow-gold",
        status === "upcoming" && "bg-forest-50 text-forest-300 border border-forest-100",
        status === "frozen" && "bg-terracotta-100 text-terracotta-500",
      )}
    >
      {status === "released" && (
        <>
          <CheckIcon className={ICON_SIZE[density]} />
          {!prefersReducedMotion && (
            <span className="absolute inset-0 animate-shine-sweep bg-gold-shine" aria-hidden="true" />
          )}
        </>
      )}
      {status === "upcoming" && <ClockIcon className={ICON_SIZE[density]} />}
      {status === "frozen" && (
        <motion.span
          className="flex items-center justify-center"
          animate={prefersReducedMotion ? undefined : { opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <FrostIcon className={ICON_SIZE[density]} />
        </motion.span>
      )}
    </div>
  );
}

function TimelineNodeContent({
  node,
  density,
  periodLabel,
  isLast,
  showTime,
}: {
  node: EscrowTimelineNodeData;
  density: Density;
  periodLabel: string;
  isLast: boolean;
  showTime: boolean;
}) {
  const statusText =
    node.status === "released" ? "Released" : node.status === "frozen" ? "Frozen" : "Upcoming";
  const dateLabel = showTime ? formatDateTime(node.releaseDate) : formatDate(node.releaseDate);
  const dateLabelLong = showTime ? formatDateTime(node.releaseDate, "long") : formatDate(node.releaseDate, "long");

  if (density === "compact") {
    return (
      <div className={cn("flex flex-1 items-center justify-between", !isLast && "pb-1")}>
        <span className="text-xs font-medium text-ink-muted">
          {periodLabel} {node.period}
          <span className="ml-2 text-ink-soft">{dateLabel}</span>
        </span>
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            node.status === "released" && "text-gold-600",
            node.status === "frozen" && "text-terracotta-500",
            node.status === "upcoming" && "text-ink-soft",
          )}
        >
          {formatUSDC(node.amount)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-1 flex-col", !isLast && "pb-4")}>
      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "font-semibold text-ink",
            density === "large" ? "text-lg" : "text-sm",
          )}
        >
          {periodLabel} {node.period}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            node.status === "released" && "bg-gold-50 text-gold-600",
            node.status === "frozen" && "bg-terracotta-50 text-terracotta-500",
            node.status === "upcoming" && "bg-cream-400 text-ink-muted",
          )}
        >
          {statusText}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">{dateLabelLong}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-semibold tabular-nums text-ink",
            density === "large" ? "text-base" : "text-sm",
          )}
        >
          <UsdcIcon className="h-3.5 w-3.5 shrink-0" />
          {formatUSDC(node.amount)}
          <span className="ml-1 text-xs font-normal text-ink-soft">USDC</span>
        </span>
      </div>
      {node.status === "frozen" && (
        <p className="mt-1 text-xs text-terracotta-500">
          Release paused pending dispute resolution
        </p>
      )}
    </div>
  );
}
