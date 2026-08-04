"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { MailIcon, XLogoIcon } from "@/components/icons/NavIcons";

const EMAIL = "rentpact1@gmail.com";
const X_HANDLE = "@RentPact";
const X_URL = "https://x.com/RentPact";

export default function ContactPage() {
  const { session } = useAuth();
  const home = session ? "/dashboard" : "/";
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — the address is still visible for manual copy
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <header className="border-b border-forest-100/60 px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={home}>
            <Logo size={28} wordmarkClassName="text-ink" />
          </Link>
          <Link href={home} className="text-sm text-forest-500 underline underline-offset-4 hover:text-forest-600">
            ← Back
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-14 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-gold-600">Get in touch</p>
        <h1 className="mt-1 font-serif text-4xl text-ink">Contact the RentPact team</h1>
        <p className="mt-3 text-ink-muted">
          Questions, feedback, a lease or payment you need help with — we&apos;d genuinely love to hear from you.
          We usually reply within 1–2 days.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {/* Email */}
          <div className="rounded-lg border border-forest-100 bg-cream-100 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-500">
                <MailIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Email us</p>
                <p className="truncate text-sm text-ink-soft">{EMAIL}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`mailto:${EMAIL}`}>
                <Button size="sm">Send an email</Button>
              </a>
              <Button size="sm" variant="secondary" onClick={copyEmail}>
                {copied ? "Copied ✓" : "Copy address"}
              </Button>
            </div>
          </div>

          {/* X */}
          <div className="rounded-lg border border-forest-100 bg-cream-100 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-500">
                <XLogoIcon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Message us on X</p>
                <p className="truncate text-sm text-ink-soft">{X_HANDLE}</p>
              </div>
            </div>
            <div className="mt-4">
              <a href={X_URL} target="_blank" rel="noreferrer">
                <Button size="sm" variant="secondary">
                  Open on X
                </Button>
              </a>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-ink-soft">
          Reaching out about a specific lease? Include your <span className="font-medium text-ink-muted">lease ID</span> so
          we can look into it faster.
        </p>
      </div>
    </main>
  );
}
