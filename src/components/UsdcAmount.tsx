import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { formatUSDC } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Renders `<icon> 1,234.56 USDC` — the consistent way any USDC figure
 * should appear in the app. Use this instead of a bare `formatUSDC(x)
 * USDC` string wherever an amount is shown; skip it for prose sentences
 * that just mention "USDC" in passing, where an inline icon looks noisy.
 */
export function UsdcAmount({
  amount,
  className,
  iconSize = 14,
  suffix = true,
}: {
  amount: number;
  className?: string;
  iconSize?: number;
  /** Whether to append the literal "USDC" label after the number. */
  suffix?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <UsdcIcon style={{ width: iconSize, height: iconSize }} className="shrink-0" />
      {formatUSDC(amount)}
      {suffix && " USDC"}
    </span>
  );
}
