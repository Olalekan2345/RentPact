import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  /** Accessible label describing what the toggle controls. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible on/off switch. The knob is a flex-centered child (not absolutely
 * positioned), so it stays perfectly inside the track — h-5 knob in an h-6
 * track leaves an even 2px gap all around, and it only ever translates on the
 * horizontal axis.
 */
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-100",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-forest-500" : "bg-cream-400",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-cream-50 shadow-sm transition-transform duration-200 ease-in-out",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
