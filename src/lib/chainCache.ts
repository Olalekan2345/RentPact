/**
 * Stale-while-revalidate cache for on-chain reads (lease lists, activity
 * feeds, reputation). Real-mode reads scan event logs over a public testnet
 * RPC — multiple sequential round trips per lease — which made the dashboard
 * and lease pages feel slow on every visit. This keeps those pages instant
 * on revisit while staying honest about freshness:
 *
 *  - < 30s old: served straight from cache (bell polling keeps it warm)
 *  - 30s–5min old: served instantly, refreshed in the background so the
 *    next navigation sees fresh data
 *  - older / missing: fetched normally (the unavoidable cold-start cost)
 *
 * Every mutation in leaseData.ts calls invalidateChainCache() after its
 * transaction lands, so your own actions always read back fresh. A
 * generation counter stops in-flight background refreshes (started before
 * the mutation) from clobbering the cache with pre-mutation state.
 *
 * Persisted to sessionStorage so full reloads within a tab benefit too;
 * values that can't serialize (bigint fields, e.g. credential summaries)
 * quietly stay memory-only.
 */

const PREFIX = "rentpact:chain-cache:v1:";
const MAX_AGE_MS = 5 * 60_000;
const REVALIDATE_AFTER_MS = 30_000;

interface Entry {
  v: unknown;
  t: number;
}

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let generation = 0;

function readEntry(key: string): Entry | null {
  const hit = memory.get(key);
  if (hit) return hit;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeEntry(key: string, v: unknown) {
  const entry: Entry = { v, t: Date.now() };
  memory.set(key, entry);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // bigint payloads or quota — the in-memory cache still applies
  }
}

export function invalidateChainCache() {
  generation++;
  memory.clear();
  inflight.clear();
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) window.sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}

function fetchInto<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const gen = generation;
  const p = fetcher()
    .then((v) => {
      if (gen === generation) writeEntry(key, v);
      inflight.delete(key);
      return v;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

export function cachedChainRead<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = readEntry(key);
  if (hit) {
    const age = Date.now() - hit.t;
    if (age < MAX_AGE_MS) {
      if (age > REVALIDATE_AFTER_MS) {
        fetchInto(key, fetcher).catch(() => {
          // background refresh failure is non-fatal — cache stays as-is
        });
      }
      return Promise.resolve(hit.v as T);
    }
  }
  return fetchInto(key, fetcher);
}
