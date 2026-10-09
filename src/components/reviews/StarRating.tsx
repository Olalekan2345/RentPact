import { cn } from "@/lib/utils";

const STAR_PATH =
  "M12 2.6l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.03l-5.66 2.98 1.08-6.3-4.57-4.46 6.32-.92L12 2.6z";

export function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d={STAR_PATH} />
    </svg>
  );
}

const SIZE = { xs: "h-3 w-3", sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-6 w-6" } as const;

function Row({ size }: { size: keyof typeof SIZE }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon key={i} className={cn(SIZE[size], "shrink-0")} />
      ))}
    </>
  );
}

/** Read-only 0–5 star display; fractional values fill the last star partially. */
export function StarRating({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span
      role="img"
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <span className="flex text-forest-100" aria-hidden>
        <Row size={size} />
      </span>
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden text-gold-400"
        style={{ width: `${(clamped / 5) * 100}%` }}
        aria-hidden
      >
        <Row size={size} />
      </span>
    </span>
  );
}
