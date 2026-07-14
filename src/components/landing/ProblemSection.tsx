"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { CrackedHouseScene, FallingNote } from "@/components/landing/CrackedHouseScene";

const BEATS = [
  { range: [0, 0.25], text: "In Lagos, you pay 1–2 years of rent upfront.", tone: "text-cream-100" },
  { range: [0.25, 0.5], text: "Then the landlord disappears. The repairs never come.", tone: "text-cream-100" },
  { range: [0.5, 0.75], text: "Your caution fee? Gone. It always is.", tone: "text-cream-100" },
  { range: [0.75, 1], text: "No escrow. No evidence. No recourse.", tone: "text-terracotta-300" },
] as const;

/**
 * Scroll-scrubbed (not time-based): a single house cracks apart as the user
 * scrolls through this pinned section. Reduced height (240vh, not the
 * original 300vh brief) to keep total page scroll length reasonable across
 * a page with several of these — flagged as a deliberate trim.
 */
export function ProblemSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  if (prefersReducedMotion) {
    return <ProblemSectionReduced />;
  }

  return (
    <section ref={sectionRef} className="relative h-[240vh] bg-forest-900">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-8 px-4 sm:grid-cols-2 sm:px-8">
          <div className="relative order-2 flex justify-center sm:order-1">
            <CrackedHouseScene progress={scrollYProgress} className="h-[280px] w-[320px] sm:h-[340px] sm:w-[400px]" />
            <div className="absolute right-4 top-8 sm:right-0">
              <FallingNote progress={scrollYProgress} />
            </div>
          </div>

          <div className="relative order-1 h-40 sm:order-2 sm:h-48">
            {BEATS.map((beat) => (
              <BeatText key={beat.text} scrollYProgress={scrollYProgress} beat={beat} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BeatText({
  scrollYProgress,
  beat,
}: {
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
  beat: (typeof BEATS)[number];
}) {
  const [start, end] = beat.range;
  const pad = (end - start) * 0.15;
  const opacity = useTransform(
    scrollYProgress,
    [start, start + pad, end - pad, end],
    [0, 1, 1, 0],
  );
  const x = useTransform(scrollYProgress, [start, start + pad], [-32, 0]);

  return (
    <motion.p
      style={{ opacity, x }}
      className={`absolute inset-0 flex items-center text-balance font-serif text-2xl leading-snug sm:text-3xl ${beat.tone}`}
    >
      {beat.text}
    </motion.p>
  );
}

/** prefers-reduced-motion fallback: the four beats as simple stacked, fade-in-once text — no scroll scrubbing, no scene. */
function ProblemSectionReduced() {
  return (
    <section className="bg-forest-900 px-4 py-24 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        {BEATS.map((beat) => (
          <p
            key={beat.text}
            className={`text-balance font-serif text-2xl leading-snug sm:text-3xl ${beat.tone}`}
          >
            {beat.text}
          </p>
        ))}
      </div>
    </section>
  );
}
