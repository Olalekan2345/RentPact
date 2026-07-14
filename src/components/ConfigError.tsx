import type { EnvValidationResult } from "@/lib/env";

export function ConfigError({
  result,
}: {
  result: Extract<EnvValidationResult, { success: false }>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6 py-16">
      <div className="w-full max-w-2xl rounded-lg border border-terracotta-400/40 bg-[#1c1b19] p-8 font-sans text-cream shadow-lifted">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta-400 text-sm font-bold text-white">
            !
          </span>
          <h1 className="font-serif text-2xl text-white">
            Configuration error
          </h1>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-cream/70">
          RentPact can&apos;t start because required environment variables
          are missing or invalid. Copy{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 text-terracotta-200">
            .env.example
          </code>{" "}
          to{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 text-terracotta-200">
            .env.local
          </code>{" "}
          and fill in the values below.
        </p>

        {result.missing.length > 0 && (
          <div className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-terracotta-300">
              Missing
            </h2>
            <ul className="space-y-1.5">
              {result.missing.map((key) => (
                <li
                  key={key}
                  className="rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-cream/90"
                >
                  {key}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.invalid.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-terracotta-300">
              Invalid
            </h2>
            <ul className="space-y-1.5">
              {result.invalid.map((issue) => (
                <li
                  key={issue.path}
                  className="rounded border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-cream/90"
                >
                  {issue.path}{" "}
                  <span className="text-cream/50">— {issue.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
