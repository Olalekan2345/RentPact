"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { RATING_LABELS } from "@/lib/reviewModel";
import { StarIcon } from "./StarRating";

/**
 * 1–5 star picker. Starts unselected (0) so a rating is always a deliberate
 * choice rather than a pre-filled 5. Keyboard: arrow keys move the rating,
 * as a radio group should.
 */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover ?? value;

  const move = (next: number) => {
    const clamped = Math.max(1, Math.min(5, next));
    onChange(clamped);
    buttons.current[clamped - 1]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      move((value || 0) + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      move((value || 2) - 1);
    }
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Your rating" className="flex gap-1" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => {
              buttons.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}, ${RATING_LABELS[n - 1]}`}
            tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onKeyDown={onKeyDown}
            className="rounded-md p-0.5 transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 active:scale-95 disabled:pointer-events-none"
          >
            <StarIcon className={cn("h-8 w-8 transition-colors", n <= shown ? "text-gold-400" : "text-forest-100")} />
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-sm font-medium text-ink-muted" aria-live="polite">
        {shown > 0 ? RATING_LABELS[shown - 1] : "Tap a star to rate"}
      </p>
    </div>
  );
}
