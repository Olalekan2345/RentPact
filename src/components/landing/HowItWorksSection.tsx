"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { WordDropHeadline } from "@/components/landing/WordDropHeadline";

const STEPS = [
  {
    title: "Deposit into escrow",
    body: "The tenant deposits the full lease amount in USDC — once, up front — into a smart contract. No landlord ever touches it directly.",
  },
  {
    title: "Landlord signs",
    body: "The landlord countersigns on-chain, starting the release schedule you both agreed on.",
  },
  {
    title: "Rent releases on schedule",
    body: "Each period, the agreed amount flows to the landlord automatically — monthly, quarterly, yearly, even daily or hourly.",
  },
  {
    title: "Frozen on dispute",
    body: "If something goes wrong, either side can freeze the next release with one on-chain action, backed by photo evidence.",
  },
  {
    title: "Caution fee returns",
    body: "At move-out, the caution fee returns to the tenant automatically within 7 days, unless a documented claim is filed.",
  },
] as const;

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const headlineInView = useInView(headlineRef, { margin: "-20%", once: true });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start center", "end center"],
  });

  const linePathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section className="bg-cream-200 px-4 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-forest-400">How it works</p>
        <h2 className="mt-1 max-w-lg text-3xl text-ink sm:text-4xl">
          Every lease follows the same protected path
        </h2>

        <div ref={sectionRef} className="relative mt-16 pl-12 sm:pl-16">
          {/* Track (static, faint) + draw-on progress line */}
          <div className="absolute left-4 top-2 h-[calc(100%-1rem)] w-px bg-forest-100 sm:left-6" aria-hidden="true" />
          <svg
            className="absolute left-4 top-2 h-[calc(100%-1rem)] w-px overflow-visible sm:left-6"
            aria-hidden="true"
          >
            <motion.line
              x1="0"
              y1="0"
              x2="0"
              y2="100%"
              stroke="#D4A017"
              strokeWidth="2"
              style={{ pathLength: prefersReducedMotion ? 1 : linePathLength }}
            />
          </svg>

          <ul className="flex flex-col gap-16">
            {STEPS.map((step, i) => (
              <TimelineStep key={step.title} step={step} index={i} total={STEPS.length} scrollYProgress={scrollYProgress} reducedMotion={!!prefersReducedMotion} />
            ))}
          </ul>
        </div>

        <div ref={headlineRef} className="mt-24 text-center">
          <h3 className="text-balance text-3xl leading-tight text-ink sm:text-5xl">
            {headlineInView && <WordDropHeadline text="Evidence decides. Not argument." delayStart={0.1} />}
          </h3>
        </div>
      </div>
    </section>
  );
}

function TimelineStep({
  step,
  index,
  total,
  scrollYProgress,
  reducedMotion,
}: {
  step: (typeof STEPS)[number];
  index: number;
  total: number;
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
  reducedMotion: boolean;
}) {
  const threshold = index / (total - 1);
  const nodeScale = useTransform(scrollYProgress, [Math.max(0, threshold - 0.06), threshold], [0.6, 1]);
  const nodeFill = useTransform(
    scrollYProgress,
    [Math.max(0, threshold - 0.06), threshold],
    ["#E8DCC8", "#D4A017"],
  );

  return (
    <li className="relative">
      <motion.div
        className="absolute -left-12 top-1 h-4 w-4 rounded-full border-2 border-forest-500 sm:-left-16"
        style={
          reducedMotion
            ? { backgroundColor: "#D4A017" }
            : { scale: nodeScale, backgroundColor: nodeFill }
        }
      />
      {/* Text stays fully legible at all times — only the node lights up as you scroll,
          so contrast never drops below WCAG AA (an opacity-fade here previously failed it). */}
      <div>
        <h3 className="text-lg text-ink sm:text-xl">{step.title}</h3>
        <p className="mt-1.5 max-w-md text-sm text-ink-muted">{step.body}</p>
      </div>
    </li>
  );
}
