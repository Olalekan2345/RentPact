"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui";
import { PropertyImage } from "@/components/PropertyImage";
import { WordDropHeadline } from "@/components/landing/WordDropHeadline";
import { RotatingWord } from "@/components/landing/RotatingWord";

const ROTATING_LINES = ["Frozen on dispute.", "Backed by evidence.", "Returned when owed.", "Built for Naija."];

export function HeroSection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* A real, full-bleed house photo — the sole background for this section. */}
      <div className="absolute inset-0">
        <PropertyImage
          seed="landing-hero-bg"
          propertyType="house"
          alt="A well-kept home available on RentPact"
          className="h-full w-full"
          priority
        />
      </div>
      {/* Bottom-up fade so the headline sits on solid cream, plus a top scrim so the
          navbar stays legible regardless of what's bright in the photo up there. */}
      <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/75 to-cream/20" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cream/90 to-transparent" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 pb-24 pt-32 sm:px-8 sm:pb-32">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-forest-500">
          Built on Arc · Powered by Circle
        </p>

        <h1 className="max-w-2xl text-balance text-4xl leading-[1.05] text-ink sm:text-6xl">
          <WordDropHeadline text="Rent held in escrow." delayStart={0.15} />
          <br />
          <WordDropHeadline text="Released on schedule." delayStart={0.55} />
          <br />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: prefersReducedMotion ? 0.3 : 1.15, duration: 0.5 }}
            className="block"
          >
            <RotatingWord words={ROTATING_LINES} className="text-gold-500" />
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: prefersReducedMotion ? 0.4 : 1.4, duration: 0.6 }}
          className="mt-5 max-w-xl text-balance text-lg text-ink-muted"
        >
          No bank, no lawyer, no trust required. RentPact protects tenants and
          landlords with a USDC escrow contract that pays out on the schedule
          you agree to — monthly, quarterly, yearly, even daily or hourly.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: prefersReducedMotion ? 0.5 : 1.65, duration: 0.6 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <PulsingCta />
        </motion.div>
      </div>

      <ScrollIndicator />
    </section>
  );
}

function PulsingCta() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <span className="relative inline-block w-full sm:w-auto">
      {!prefersReducedMotion && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-gold-400"
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.55, 0], scale: [1, 1.18, 1.3] }}
          transition={{ duration: 1.1, repeat: 2, repeatDelay: 0.3, delay: 2, ease: "easeOut" }}
        />
      )}
      <Link href="/auth" className="relative block">
        <Button size="lg" className="w-full sm:w-auto">
          Create your first lease
        </Button>
      </Link>
    </span>
  );
}

function ScrollIndicator() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2" aria-hidden="true">
      <div className="relative h-10 w-px bg-gold-300/70">
        {!prefersReducedMotion && (
          <motion.span
            className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold-500"
            animate={{ y: [0, 32, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
    </div>
  );
}
