"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { getOrCreateWallet } from "@/lib/circle";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Session {
  email: string;
  address: Address;
}

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  /** Set if Supabase auth succeeded but Circle wallet provisioning failed. */
  sessionError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    async function provisionFor(email: string) {
      setSessionError(null);
      try {
        const wallet = await getOrCreateWallet(email);
        if (cancelled) return;
        setSession({ email: wallet.email, address: wallet.address });
      } catch (err) {
        if (cancelled) return;
        console.error("Wallet provisioning failed:", err);
        setSession(null);
        setSessionError("Something went wrong setting up your wallet. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email;
      if (email) {
        provisionFor(email);
      } else {
        if (!cancelled) {
          setSession(null);
          setIsLoading(false);
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      const email = authSession?.user.email;
      if (email) {
        setIsLoading(true);
        provisionFor(email);
      } else {
        setSession(null);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, sessionError, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
