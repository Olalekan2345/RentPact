import { cn } from "@/lib/utils";

/**
 * The RentPact mark — a transparent PNG, so it reads fine directly on light
 * backgrounds. On dark backgrounds (the sidebar's forest-500) the mark's
 * dark-green linework loses contrast, so `chip` wraps it in a small cream
 * circle instead of shipping a separate inverted artwork.
 */
export function LogoMark({ size = 28, chip = false, className }: { size?: number; chip?: boolean; className?: string }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-mark.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", !chip && className)}
      style={{ width: size, height: size }}
    />
  );

  if (!chip) return img;

  const padding = Math.round(size * 0.18);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-cream-50", className)}
      style={{ width: size + padding * 2, height: size + padding * 2 }}
    >
      {img}
    </span>
  );
}

export function Logo({
  size = 28,
  chip = false,
  wordmark = true,
  wordmarkClassName,
  className,
}: {
  size?: number;
  chip?: boolean;
  wordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} chip={chip} />
      {wordmark && (
        <span className={cn("font-serif text-lg tracking-wide", wordmarkClassName)}>RentPact</span>
      )}
    </span>
  );
}
