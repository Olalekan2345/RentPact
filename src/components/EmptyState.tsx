import Link from "next/link";
import { Button } from "@/components/ui";
import { KeysIllustration } from "@/components/icons/BrandIllustrations";
import { LogoMark } from "@/components/Logo";

export function EmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-lg border border-dashed border-forest-200 bg-cream-100 px-6 py-14 text-center">
      <LogoMark size={180} className="pointer-events-none absolute -bottom-10 -right-10 opacity-[0.04]" />
      <KeysIllustration className="h-16 w-16" />
      <h3 className="mt-5 text-xl text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">{body}</p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="mt-6">
          <Button>{ctaLabel}</Button>
        </Link>
      )}
    </div>
  );
}
