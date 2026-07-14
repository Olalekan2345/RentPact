"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { fetchPropertyImageUrl } from "@/lib/unsplash";
import { Skeleton } from "@/components/ui";

export interface PropertyImageProps {
  /** Stable per-lease seed so repeated renders don't refetch a different photo. */
  seed: string;
  propertyType: string;
  /** User-supplied photo URL takes priority over any fetched image. */
  overrideUrl?: string | null;
  alt: string;
  className?: string;
  /** Skip lazy-loading for above-the-fold images (e.g. the hero) so they paint immediately. */
  priority?: boolean;
}

export function PropertyImage({ seed, propertyType, overrideUrl, alt, className, priority }: PropertyImageProps) {
  const [url, setUrl] = useState<string | null>(overrideUrl ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(overrideUrl ? "ready" : "loading");

  useEffect(() => {
    if (overrideUrl) {
      setUrl(overrideUrl);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    fetchPropertyImageUrl(propertyType).then((fetched) => {
      if (cancelled) return;
      if (fetched) {
        setUrl(fetched);
        setStatus("ready");
      } else {
        setStatus("fallback");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [overrideUrl, propertyType, seed]);

  if (status === "loading") {
    return <Skeleton className={cn("w-full", className)} />;
  }

  if (status === "fallback" || !url) {
    return <ArchitecturalFallback className={className} seed={seed} />;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image
        src={url}
        alt={alt}
        fill
        sizes="100vw"
        className="object-cover"
        priority={priority}
        onError={() => setStatus("fallback")}
      />
    </div>
  );
}

/** Designed SVG placeholder — never a broken image, never a stock icon dump. */
function ArchitecturalFallback({ className, seed }: { className?: string; seed: string }) {
  // Vary the skyline silhouette deterministically per lease so cards don't look identical.
  const hash = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const roofOffset = 8 + (hash % 12);

  return (
    <div
      className={cn(
        "relative flex items-end justify-center overflow-hidden bg-gradient-to-br from-forest-500 to-teal-deep",
        className,
      )}
    >
      <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" className="h-full w-full opacity-90">
        <rect x="40" y="70" width="90" height="90" fill="#0A4A3F" opacity="0.8" />
        <polygon points={`40,70 85,${70 - roofOffset} 130,70`} fill="#D4A017" opacity="0.9" />
        <rect x="150" y="40" width="70" height="120" fill="#0B3D2E" opacity="0.85" />
        <rect x="240" y="85" width="110" height="75" fill="#0A4A3F" opacity="0.8" />
        <polygon points={`240,85 295,${85 - roofOffset} 350,85`} fill="#D4A017" opacity="0.75" />
        <rect x="60" y="90" width="14" height="18" fill="#FAF6EF" opacity="0.5" />
        <rect x="95" y="90" width="14" height="18" fill="#FAF6EF" opacity="0.5" />
        <rect x="165" y="60" width="14" height="18" fill="#FAF6EF" opacity="0.4" />
        <rect x="190" y="60" width="14" height="18" fill="#FAF6EF" opacity="0.4" />
        <rect x="260" y="105" width="14" height="18" fill="#FAF6EF" opacity="0.4" />
        <rect x="290" y="105" width="14" height="18" fill="#FAF6EF" opacity="0.4" />
        <rect x="320" y="105" width="14" height="18" fill="#FAF6EF" opacity="0.4" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-forest-900/40 to-transparent" />
    </div>
  );
}
