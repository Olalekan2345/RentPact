"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  name?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  name = "segmented-control",
}: SegmentedControlProps<T>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      role="radiogroup"
      className={cn(
        "relative inline-flex w-full rounded-full bg-cream-400 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400",
              isActive ? "text-cream-50" : "text-ink-muted hover:text-forest-500",
            )}
          >
            {isActive && (
              <motion.span
                layoutId={prefersReducedMotion ? undefined : `${name}-pill`}
                className="absolute inset-0 -z-10 rounded-full bg-forest-500 shadow-soft"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
