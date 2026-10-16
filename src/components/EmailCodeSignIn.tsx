"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PrivyProvider, useLoginWithEmail, usePrivy } from "@privy-io/react-auth";
import { Button, Input } from "@/components/ui";

/**
 * "Email me a code" sign-in, alongside Google. Privy sends and checks the 6-digit code (so no email
 * server or domain is needed on our side); /api/auth/privy then turns that proof into the same Supabase
 * session Google sign-in creates. Privy is mounted only here — load this component with next/dynamic so
 * its SDK never ships on other pages. Renders nothing until NEXT_PUBLIC_PRIVY_APP_ID is set.
 */
export function EmailCodeSignIn({ next }: { next?: string }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return null;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        // RentPact wallets are Circle wallets; Privy is only proving the email.
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <EmailCodeForm next={next} />
    </PrivyProvider>
  );
}

function EmailCodeForm({ next }: { next?: string }) {
  const { ready, authenticated, getAccessToken, logout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "finishing">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A Privy session left over from an earlier attempt would make sendCode refuse; start clean.
  useEffect(() => {
    if (ready && authenticated && step === "email") logout().catch(() => undefined);
  }, [ready, authenticated, step, logout]);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendCode({ email: address });
      setCode("");
      setStep("code");
    } catch {
      setError("We couldn't send a code to that address. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithCode({ code: digits });
    } catch {
      setBusy(false);
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    setStep("finishing");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("no token");
      const res = await fetch("/api/auth/privy", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Sign-in didn't complete.");
      }
      await logout().catch(() => undefined); // the Supabase session is what the app uses from here
      // Full navigation so the app picks up the new session cookie, exactly like the Google callback.
      window.location.assign(next ?? "/dashboard");
    } catch (err) {
      await logout().catch(() => undefined);
      setStep("email");
      setBusy(false);
      setError(err instanceof Error && err.message !== "no token" ? err.message : "Sign-in didn't complete. Please try again.");
    }
  };

  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="flex flex-col gap-3" noValidate>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" size="lg" disabled={busy || !ready} className="w-full">
          {busy ? "Sending code…" : !ready ? "Loading…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-3" noValidate>
      <p className="text-sm text-ink-muted">
        We sent a 6-digit code to <span className="font-medium text-ink">{email.trim()}</span>. It expires in 10 minutes.
      </p>
      <Input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        label="Code"
        placeholder="123456"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        error={error ?? undefined}
        autoFocus
      />
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {step === "finishing" ? "Signing you in…" : busy ? "Checking…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setError(null);
        }}
        disabled={busy}
        className="text-sm text-forest-500 underline-offset-2 hover:underline disabled:opacity-50"
      >
        Use a different email or resend the code
      </button>
    </form>
  );
}
