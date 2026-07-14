"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";

const SLIDES = [
  {
    title: "What is escrow, really?",
    body: "Escrow means the money isn't with the landlord and isn't with the tenant — it sits in a smart contract that only releases funds when the agreed conditions are met.",
  },
  {
    title: "Why photo evidence matters",
    body: "Move-in photos are hashed and timestamped on-chain the moment they're uploaded. If a dispute happens later, there's a real record to compare against — not just two people's word.",
  },
  {
    title: "How disputes get resolved",
    body: "Either side can raise a dispute with evidence attached. The next release freezes automatically until it's resolved — nobody can quietly walk away with the money.",
  },
  {
    title: "What \"gasless\" means for you",
    body: "You never need to hold a separate token to pay network fees. RentPact covers the gas, so depositing, signing, and releasing rent all just work — no crypto experience required.",
  },
  {
    title: "Why USDC instead of Naira",
    body: "USDC is a dollar-backed stablecoin, so the value held in escrow doesn't drift while it waits to be released — useful for lease terms that run months or years.",
  },
] as const;

const SLIDE_DURATION_MS = 5000;

export function EducationalSlider() {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((next: number) => {
    setDirection(next > index || (index === SLIDES.length - 1 && next === 0) ? 1 : -1);
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, [index]);

  useEffect(() => {
    if (paused || prefersReducedMotion) return;
    timerRef.current = setInterval(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_DURATION_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, prefersReducedMotion]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) {
      goTo(index + 1);
    } else if (info.offset.x > 60) {
      goTo(index - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") goTo(index + 1);
    if (e.key === "ArrowLeft") goTo(index - 1);
  };

  const slide = SLIDES[index];

  return (
    <section className="bg-cream px-4 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-2xl">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-forest-400">
          New to escrow rent?
        </p>
        <h2 className="mt-1 text-center text-3xl text-ink sm:text-4xl">A few things worth knowing</h2>

        <div
          className="relative mt-12 h-64 overflow-hidden rounded-lg border border-forest-100/60 bg-cream-100 shadow-card sm:h-52"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Educational slides about how RentPact escrow works"
          onKeyDown={handleKeyDown}
        >
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={index}
              custom={direction}
              variants={
                prefersReducedMotion
                  ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
                  : {
                      enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
                    }
              }
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: "easeOut" }}
              drag={prefersReducedMotion ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="absolute inset-0 flex cursor-grab flex-col justify-center px-8 py-8 active:cursor-grabbing sm:px-12"
            >
              <h3 className="font-serif text-xl text-ink sm:text-2xl">{slide.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">{slide.body}</p>
            </motion.div>
          </AnimatePresence>

          <span className="sr-only" aria-live="polite">
            {`Slide ${index + 1} of ${SLIDES.length}: ${slide.title}`}
          </span>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}: ${s.title}`}
              aria-current={i === index}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-gold-500" : "w-2 bg-forest-100"}`}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
