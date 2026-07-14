"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useReducedMotion } from "framer-motion";
import { CrackedHouseScene } from "@/components/landing/CrackedHouseScene";
import { WordDropHeadline } from "@/components/landing/WordDropHeadline";
import { Logo } from "@/components/Logo";

const FEATURES = [
  {
    title: "Escrow, not hope",
    body: "The full lease amount sits in a smart contract from day one. No landlord ever touches it directly.",
    Loop: CoinsIntoVault,
  },
  {
    title: "Evidence, not argument",
    body: "Baseline photos are hashed at move-in. Every dispute is judged against a real, timestamped record.",
    Loop: EvidenceFlash,
  },
  {
    title: "Automatic returns",
    body: "The caution fee returns to the tenant in 7 days automatically, unless a claim with photo evidence is filed.",
    Loop: ReturnedCoin,
  },
] as const;

export function TurnSection() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sceneRef, { margin: "-15%", once: true });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="bg-cream px-4 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <div ref={sceneRef} className="flex flex-col items-center text-center">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
            <RepairScene inView={inView} reducedMotion={!!prefersReducedMotion} />
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <Logo size={72} wordmarkClassName="text-4xl text-forest-500 sm:text-5xl" className="gap-3" />
            </motion.div>
          </div>

          <h2 className="mt-8 max-w-2xl text-balance text-3xl leading-tight text-ink sm:text-5xl">
            {inView && <WordDropHeadline text="RentPact puts the money where the trust should be." delayStart={0.9} />}
          </h2>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {FEATURES.map(({ title, body, Loop }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="flex flex-col items-center rounded-lg border border-forest-100/60 bg-cream-100 p-6 text-center shadow-card sm:items-start sm:text-left"
            >
              <Loop />
              <h3 className="mt-4 text-lg text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Drives CrackedHouseScene's progress 1 → 0 (cracked → whole) once in view, then reveals the shield. */
function RepairScene({ inView, reducedMotion }: { inView: boolean; reducedMotion: boolean }) {
  const progress = useMotionValue(1);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion) {
      progress.set(0);
      return;
    }
    const controls = { cancelled: false };
    const start = performance.now();
    const duration = 1400;
    function step(now: number) {
      if (controls.cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      progress.set(1 - eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return () => {
      controls.cancelled = true;
    };
  }, [inView, reducedMotion, progress]);

  return (
    <CrackedHouseScene
      progress={progress}
      showShield
      photoSeed="turn-section-house"
      photoType="house"
      className="h-[260px] w-[300px] sm:h-[320px] sm:w-[360px]"
    />
  );
}

function CoinsIntoVault() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 80 60" className="h-14 w-20" aria-hidden="true">
      <rect x="10" y="30" width="60" height="24" rx="3" fill="#0B3D2E" />
      <rect x="30" y="30" width="20" height="4" fill="#D4A017" opacity={0.8} />
      {[0, 1].map((i) => (
        <motion.circle
          key={i}
          cx={40}
          r={7}
          fill="#D4A017"
          initial={{ cy: 0, opacity: 0 }}
          animate={
            prefersReducedMotion
              ? { cy: 30, opacity: 1 }
              : { cy: [0, 30], opacity: [0, 1, 0] }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.4 }
              : { duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeIn" }
          }
        />
      ))}
    </svg>
  );
}

function EvidenceFlash() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 80 60" className="h-14 w-20" aria-hidden="true">
      <motion.rect
        x="8"
        y="10"
        width="28"
        height="40"
        rx="2"
        fill="#337357"
        initial={{ x: 2 }}
        animate={prefersReducedMotion ? { x: 8 } : { x: [2, 8] }}
        transition={prefersReducedMotion ? { duration: 0.4 } : { duration: 1.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
      <motion.rect
        x="44"
        y="10"
        width="28"
        height="40"
        rx="2"
        fill="#0B3D2E"
        initial={{ x: 78 }}
        animate={prefersReducedMotion ? { x: 44 } : { x: [50, 44] }}
        transition={prefersReducedMotion ? { duration: 0.4 } : { duration: 1.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
      <motion.rect
        x="0"
        y="0"
        width="80"
        height="60"
        fill="#FAF6EF"
        initial={{ opacity: 0 }}
        animate={prefersReducedMotion ? { opacity: 0 } : { opacity: [0, 0, 0.8, 0] }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.8, repeat: Infinity, times: [0, 0.75, 0.85, 1] }}
      />
    </svg>
  );
}

function ReturnedCoin() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 80 60" className="h-14 w-20" aria-hidden="true">
      <path d="M14,50 C14,36 26,30 40,30 C54,30 66,36 66,50" fill="none" stroke="#0B3D2E" strokeWidth={4} strokeLinecap="round" />
      <motion.circle
        r={7}
        fill="#D4A017"
        initial={{ cx: 66, cy: 14, opacity: 0 }}
        animate={
          prefersReducedMotion
            ? { cx: 40, cy: 26, opacity: 1 }
            : { cx: [66, 40], cy: [14, 26], opacity: [0, 1, 1, 0] }
        }
        transition={prefersReducedMotion ? { duration: 0.4 } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}
