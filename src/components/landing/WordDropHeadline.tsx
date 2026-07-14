"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Splits `text` on spaces and drops each word in from above with a slight
 * spring overshoot, staggered. Respects prefers-reduced-motion by falling
 * back to a single gentle opacity fade with no stagger or movement.
 */
export function WordDropHeadline({
  text,
  className,
  delayStart = 0,
  wordDelay = 0.12,
}: {
  text: string;
  className?: string;
  delayStart?: number;
  wordDelay?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const words = text.split(" ");

  if (prefersReducedMotion) {
    return (
      <motion.span
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: delayStart }}
      >
        {text}
      </motion.span>
    );
  }

  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: -28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: delayStart + i * wordDelay,
            type: "spring",
            damping: 9,
            stiffness: 220,
            mass: 0.6,
          }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}
