import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A "view more" link — thin underline under the text only (not the arrow),
 * with a custom arrow that eases to the right on hover. Replaces the plain
 * "Text →" pattern (a literal arrow character) used across the app.
 */
export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-sm font-medium text-forest-500 transition-colors hover:text-forest-600",
        className,
      )}
    >
      <span className="border-b border-forest-500/30 pb-0.5 transition-colors group-hover:border-forest-600">
        {children}
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1"
        aria-hidden="true"
      >
        <path
          d="M4.5 12h14M13 6l6.5 6-6.5 6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
