"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { PropertyImage } from "@/components/PropertyImage";

/** Illustrative data only — this mockup is built from the app's real UI components, not a screenshot, but is not wired to a live session. */
const MOCK_NODES = [
  { period: 1, status: "released" as const, label: "Jul 13" },
  { period: 2, status: "released" as const, label: "Aug 12" },
  { period: 3, status: "released" as const, label: "Sep 11" },
  { period: 4, status: "upcoming" as const, label: "Oct 11" },
  { period: 5, status: "upcoming" as const, label: "Nov 10" },
];

export function ProductPeekSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15%", once: true });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-forest-900 px-4 py-24 sm:px-8 sm:py-32">
      <div className="absolute inset-0 opacity-[0.08]">
        <PropertyImage seed="product-peek-bg" propertyType="house" alt="" className="h-full w-full" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-forest-900/70 via-forest-900/90 to-forest-900" />

      <div className="relative mx-auto max-w-4xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-gold-400">See it in action</p>
        <h2 className="mt-1 text-3xl text-cream-100 sm:text-4xl">A real dashboard, not a promise</h2>
        <p className="mx-auto mt-3 max-w-xl text-cream-200/80">
          Every tenant sees exactly where their money is — released, upcoming, or frozen — the moment they log in.
        </p>
      </div>

      <div ref={ref} className="relative mx-auto mt-16 max-w-3xl [perspective:1600px]">
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, rotate: -2.5, scale: 0.94, y: 24 }}
          animate={
            inView
              ? prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, rotate: 0, scale: 1, y: 0 }
              : {}
          }
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-xl border border-forest-100/20 bg-cream shadow-2xl"
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-2 border-b border-forest-100/40 bg-cream-200 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-terracotta-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-forest-400" />
            <div className="ml-3 flex-1 rounded-full bg-cream-100 px-3 py-1 text-xs text-ink-soft">
              rentpact.app/dashboard
            </div>
          </div>

          {/* Mock dashboard content */}
          <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr,1fr] sm:p-8">
            <Card className="overflow-hidden">
              <PropertyImage
                seed="product-peek-lease-card"
                propertyType="duplex"
                alt="Flat 3B, Lekki Phase 1"
                className="h-28 w-full"
              />
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Flat 3B, Lekki Phase 1</CardTitle>
                <Badge>Active</Badge>
              </CardHeader>
              <CardContent>
                <MiniEscrowTimeline inView={inView} reducedMotion={!!prefersReducedMotion} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">In escrow</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-2xl text-ink">
                <UsdcIcon className="h-6 w-6" />
                2,250.00
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mx-auto mt-6 w-fit rounded-full border border-gold-400/40 bg-forest-800 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold-300"
        >
          Gasless · Sub-second · On Arc
        </motion.div>
      </div>
    </section>
  );
}

function MiniEscrowTimeline({ inView, reducedMotion }: { inView: boolean; reducedMotion: boolean }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {MOCK_NODES.map((node, i) => (
        <motion.li
          key={node.period}
          initial={{ opacity: 0, x: -8 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: reducedMotion ? 0 : 0.5 + i * 0.12, duration: 0.4 }}
          className="flex items-center gap-3 text-sm"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${node.status === "released" ? "bg-gold-500" : "bg-forest-100"}`}
          />
          <span className="text-ink-muted">Period {node.period}</span>
          <span className="text-ink-soft">{node.label}</span>
          <span className="ml-auto text-xs uppercase tracking-wide text-ink-soft">{node.status}</span>
        </motion.li>
      ))}
    </ol>
  );
}
