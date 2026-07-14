"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Cycles through `words` on a fixed interval with a vertical slide-flip.
 * The outer span's height is set in `em` so it scales with the surrounding
 * heading's font-size at every breakpoint without a layout shift — no fixed
 * pixel height to keep in sync with responsive type scales.
 */
export function RotatingWord({
  words,
  intervalMs = 3000,
  className,
}: {
  words: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words.length, intervalMs]);

  return (
    <span
      className={`relative inline-block overflow-hidden align-bottom ${className ?? ""}`}
      style={{ height: "1.05em" }}
    >
      <AnimatePresence mode={prefersReducedMotion ? "sync" : "popLayout"} initial={false}>
        <motion.span
          key={words[index]}
          className="block whitespace-nowrap"
          initial={prefersReducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.4 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
