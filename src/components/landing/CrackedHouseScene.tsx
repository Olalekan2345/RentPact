"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { PropertyImage } from "@/components/PropertyImage";

/**
 * A real house photo used by both the Problem (Section 2, cracking) and Turn
 * (Section 3, repairing) stories — same photo, same crack/shield overlay,
 * driven in opposite directions by a 0→1 `progress` value the caller
 * controls (scroll position for Section 2, an inView-triggered animation for
 * Section 3). The crack itself is a transparent SVG overlay drawn on top of
 * the photo (framer-motion `pathLength`, same technique as the previous
 * hand-drawn illustration) — photographs can't be redrawn like vector art,
 * so the "damage" is a layer on top rather than a change to the photo itself.
 *
 * `progress` semantics: 0 = whole/healthy, 1 = fully cracked/desaturated.
 * Section 3 simply animates progress from 1 back down to 0 and layers a
 * shield draw-on on top once the photo is fully re-saturated.
 */
export function CrackedHouseScene({
  progress,
  showShield = false,
  className,
  photoSeed = "problem-section-house",
  photoType = "apartment",
}: {
  progress: MotionValue<number>;
  showShield?: boolean;
  className?: string;
  /** Lets callers show a different photo — e.g. Section 3 (Turn) uses a nicer house than Section 2 (Problem). */
  photoSeed?: string;
  photoType?: string;
}) {
  const crackPathLength = useTransform(progress, [0, 0.4, 1], [0, 1, 1]);
  const crackOpacity = useTransform(progress, [0, 0.05], [0, 1]);
  const saturation = useTransform(progress, [0.5, 1], [1, 0.15]);
  const filter = useTransform(saturation, (s) => `saturate(${s}) brightness(${0.7 + s * 0.3})`);
  const shieldPathLength = useTransform(progress, [0, 0.15], [1, 0]);
  const shieldOpacity = useTransform(progress, [0, 0.1], [1, 0]);

  return (
    <div className={`relative overflow-hidden rounded-xl shadow-lifted ${className ?? ""}`}>
      <motion.div className="absolute inset-0" style={{ filter }}>
        <PropertyImage seed={photoSeed} propertyType={photoType} alt="A rental property" className="h-full w-full" />
      </motion.div>
      {/* Dark vignette that deepens as progress increases, so the crack line stays legible over any photo */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-950/70 via-transparent to-transparent"
        style={{ opacity: useTransform(progress, [0.3, 1], [0.2, 0.85]) }}
      />

      <motion.svg viewBox="0 0 400 320" className="absolute inset-0 h-full w-full" aria-hidden="true" style={{ opacity: crackOpacity }}>
        <motion.path
          d="M150,20 L170,90 L140,140 L185,200 L155,240 L190,300"
          fill="none"
          stroke="#03110E"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ pathLength: crackPathLength }}
        />
        <motion.path
          d="M170,90 L230,105"
          fill="none"
          stroke="#03110E"
          strokeWidth={3}
          strokeLinecap="round"
          style={{ pathLength: crackPathLength }}
        />

        {showShield && (
          <motion.path
            d="M200,110 L235,122 V150 C235,174 220,190 200,198 C180,190 165,174 165,150 V122 Z M186,152 L197,163 L216,140"
            fill="none"
            stroke="#D4A017"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pathLength: shieldPathLength, opacity: shieldOpacity }}
          />
        )}
      </motion.svg>
    </div>
  );
}

/** A single naira-note glyph that tumbles and shrinks away — Section 2's "caution fee, gone" beat. */
export function FallingNote({ progress }: { progress: MotionValue<number> }) {
  const y = useTransform(progress, [0.5, 0.75], [0, 90]);
  const rotate = useTransform(progress, [0.5, 0.75], [0, 55]);
  const scale = useTransform(progress, [0.5, 0.75], [1, 0.55]);
  const opacity = useTransform(progress, [0.5, 0.62, 0.75], [0, 1, 0]);

  return (
    <motion.svg
      viewBox="0 0 60 36"
      width={60}
      height={36}
      style={{ y, rotate, scale, opacity }}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="60" height="36" rx="3" fill="#337357" />
      <circle cx="30" cy="18" r="10" fill="none" stroke="#E8DCC8" strokeWidth={1.5} />
      <text x="30" y="23" textAnchor="middle" fontSize="12" fill="#E8DCC8" fontFamily="Arial">
        ₦
      </text>
    </motion.svg>
  );
}
