"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { formatUSDC } from "@/lib/format";

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      if (ref.current) ref.current.textContent = formatUSDC(value);
      return;
    }

    const controls = animate(motionValue, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        if (ref.current) ref.current.textContent = formatUSDC(latest);
      },
    });
    return () => controls.stop();
  }, [value, motionValue, prefersReducedMotion]);

  return (
    <span ref={ref} className={className}>
      {formatUSDC(0)}
    </span>
  );
}
