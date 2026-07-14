import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-4 text-center">
      <Logo size={32} wordmarkClassName="text-forest-500" />
      <div>
        <h1 className="text-3xl text-ink">Page not found</h1>
        <p className="mt-2 text-ink-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      </div>
      <Link href="/dashboard">
        <Button>Back to dashboard</Button>
      </Link>
    </main>
  );
}
