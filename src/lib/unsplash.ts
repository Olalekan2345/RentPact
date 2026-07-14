/**
 * Property imagery via the official Unsplash API.
 *
 * Note: the legacy `source.unsplash.com` keyword-redirect service (sometimes
 * referenced in older docs/specs) was deprecated by Unsplash and no longer
 * resolves. This uses api.unsplash.com/photos/random, gated by an optional
 * NEXT_PUBLIC_UNSPLASH_ACCESS_KEY (free at unsplash.com/developers) — when a
 * key is present, callers get a fresh, varied real photo per property type.
 *
 * Without a key, callers get a fixed CURATED_FALLBACK photo per type instead
 * of `null` — real, freely-licensed (Unsplash License, not Unsplash+) photos
 * hand-picked and hotlinked directly from images.unsplash.com, verified free
 * to use. This means <PropertyImage> shows a real house even with zero API
 * setup; the generated SVG skyline in PropertyImage.tsx is now only a
 * last-resort if even a hotlink fails to load client-side.
 */

const UNSPLASH_QUERY_BY_TYPE: Record<string, string> = {
  apartment: "modern apartment building exterior",
  house: "contemporary nigerian house architecture",
  duplex: "modern african duplex home",
  bungalow: "modern lagos bungalow architecture",
  "self-contain": "small studio apartment interior modern",
  condo: "luxury condominium exterior",
  office: "modern office building exterior",
  other: "modern african luxury home",
};

/** Unsplash photo IDs, verified individually as free (images.unsplash.com), not Unsplash+ (plus.unsplash.com). */
const CURATED_PHOTO_ID_BY_TYPE: Record<string, string> = {
  house: "photo-1760067537293-6b30141d6a52", // wood + stone modern house exterior
  bungalow: "photo-1760067537293-6b30141d6a52",
  other: "photo-1760067537293-6b30141d6a52",
  apartment: "photo-1768638687896-35bde623d532", // modern apartment building, balconies
  "self-contain": "photo-1768638687896-35bde623d532",
  duplex: "photo-1761535315385-219131cb53e6", // modern apartment/duplex facade, balconies
  condo: "photo-1761535315385-219131cb53e6",
  office: "photo-1745015446589-7ee6f702d8c1", // modern glass office building facade
};

function curatedFallbackUrl(propertyType: string): string {
  const id = CURATED_PHOTO_ID_BY_TYPE[propertyType.toLowerCase()] ?? CURATED_PHOTO_ID_BY_TYPE.other;
  return `https://images.unsplash.com/${id}?q=80&w=1400&auto=format&fit=crop`;
}

export function queryForPropertyType(propertyType: string): string {
  return UNSPLASH_QUERY_BY_TYPE[propertyType.toLowerCase()] ?? UNSPLASH_QUERY_BY_TYPE.other;
}

export async function fetchPropertyImageUrl(propertyType: string): Promise<string | null> {
  const accessKey = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
  if (!accessKey) return curatedFallbackUrl(propertyType);

  try {
    const query = queryForPropertyType(propertyType);
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&content_filter=high&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${accessKey}` },
        // Unsplash's /random endpoint already varies per request; avoid caching a stale photo.
        cache: "no-store",
      },
    );
    if (!res.ok) return curatedFallbackUrl(propertyType);
    const json = await res.json();
    return json?.urls?.regular ?? curatedFallbackUrl(propertyType);
  } catch {
    return curatedFallbackUrl(propertyType);
  }
}
