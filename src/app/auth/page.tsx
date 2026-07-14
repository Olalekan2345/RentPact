"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function AuthPage() {
  const { session, sessionError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={36} wordmarkClassName="text-forest-500" />
          <h1 className="mt-5 text-3xl text-ink">Sign in to RentPact</h1>
          <p className="mt-2 text-ink-muted">Continue with Google to access your account.</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <GoogleSignInButton />
            {sessionError && <p className="text-sm text-terracotta-500">{sessionError}</p>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
