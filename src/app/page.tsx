import Link from "next/link";
import { Button } from "@/components/ui";
import { LandingTimelinePreview } from "@/components/landing/LandingTimelinePreview";
import { Logo } from "@/components/Logo";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { TurnSection } from "@/components/landing/TurnSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { EducationalSlider } from "@/components/landing/EducationalSlider";
import { ProductPeekSection } from "@/components/landing/ProductPeekSection";
import { FinalCtaSection } from "@/components/landing/FinalCtaSection";
import { BackToTopButton } from "@/components/BackToTopButton";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col bg-cream">
      {/* Navbar */}
      <header className="absolute inset-x-0 top-0 z-10 px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/">
            <Logo size={30} wordmarkClassName="text-ink" />
          </Link>
          <Link href="/auth">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <HeroSection />
      <ProblemSection />
      <TurnSection />

      {/* Interactive timeline demo — lets a visitor try the frequency toggle themselves */}
      <section className="bg-cream-200 px-4 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-forest-400">
            Try it yourself
          </p>
          <h2 className="mt-1 text-3xl text-ink sm:text-4xl">
            Every lease, on the schedule you set
          </h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            Monthly, quarterly, or yearly — the release timeline adapts to your lease.
            This is an illustrative preview, not a real account.
          </p>
          <div className="mt-10 rounded-lg border border-forest-100/60 bg-cream-100 p-6 shadow-card sm:p-8">
            <LandingTimelinePreview />
          </div>
        </div>
      </section>

      <HowItWorksSection />
      <EducationalSlider />
      <ProductPeekSection />
      <FinalCtaSection />
      <BackToTopButton />
    </main>
  );
}
