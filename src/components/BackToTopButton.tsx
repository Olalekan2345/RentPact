"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const SHOW_AFTER_PX = 800;

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-forest-100/40 bg-forest-500 text-cream-50 shadow-lifted transition-colors hover:bg-forest-600 sm:right-8"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
            <path
              d="M3 9.5L10 3.5L17 9.5V17H3V9.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8 17V12.5H12V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
