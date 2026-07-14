"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui";
import { WordDropHeadline } from "@/components/landing/WordDropHeadline";

const TRUST_ITEMS = ["Built on Arc", "Powered by Circle", "USDC", "CCTP", "Gateway"];

export function FinalCtaSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20%", once: true });

  return (
    <section className="relative overflow-hidden bg-forest-950">
      {/* Trust strip */}
      <div className="relative border-b border-cream/10 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-center text-sm font-semibold uppercase tracking-wide text-cream-200/70">
          {TRUST_ITEMS.map((item, i) => (
            <span key={item} className="flex items-center gap-x-8">
              {item}
              {i < TRUST_ITEMS.length - 1 && <span aria-hidden="true" className="text-gold-500/60">·</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Real estate-home backdrop, dusk-toned + darkened for legibility and mood */}
      <div ref={ref} className="relative min-h-[70vh] px-4 py-24 sm:px-8 sm:py-32">
        <div className="absolute inset-0 opacity-60">
          <Image
            src="/images/lekki-estate.jpg"
            alt="A gated residential estate available on RentPact"
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/80 to-forest-950/40" />
        <div className="absolute inset-0 bg-gold-500/10 mix-blend-overlay" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center pb-[28vh] text-center sm:pb-[32vh]">
          <h2 className="text-balance text-4xl leading-[1.05] text-cream-100 sm:text-6xl">
            {inView && <WordDropHeadline text="Move in with confidence." delayStart={0.1} />}
          </h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-5 max-w-lg text-balance text-lg text-cream-200/80"
          >
            No bank, no lawyer, no trust required — just a lease that protects both sides.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="mt-8"
          >
            <Link href="/auth">
              <Button size="lg" className="w-full sm:w-auto">
                Create your first lease
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>

      <footer className="relative border-t border-cream/10 px-4 py-8 text-center text-xs text-cream-200/60 sm:px-8">
        <p>RentPact runs on Arc testnet. Not for real funds.</p>
        <Link href="/constitution" className="mt-2 inline-block underline decoration-cream/30 underline-offset-4 hover:text-cream-100">
          Read the Lease Constitution
        </Link>
      </footer>
    </section>
  );
}
