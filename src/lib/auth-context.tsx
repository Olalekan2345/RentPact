"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  /**
   * True while a first-time wallet is being provisioned with Circle (a signed-in
   * user with no cached wallet yet). This is the slow one-time step — creating
   * an on-chain smart-contract wallet — so the UI can show a "setting up your
   * wallet" state instead of dead air. Returning users (cached wallet) never
   * enter this state; their refresh happens silently in the background.
   */
  isProvisioningWallet: boolean;
  /** Set if Supabase auth succeeded but Circle wallet provisioning failed. */
  sessionError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Last known wallet address per email. Circle wallet addresses are stable
 * (deterministically tied to the email-derived Circle user), so a cached
 * address lets returning users see their pages immediately instead of
 * waiting ~2s for the Circle token + wallet round trips — those still run
 * in the background to refresh the short-lived Circle session used for
 * transactions.
 */
const WALLET_CACHE_KEY = "rentpact:wallet-cache:v1";

function readWalletCache(): Session | null {
  try {
    const raw = window.localStorage.getItem(WALLET_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeWalletCache(session: Session) {
  try {
    window.localStorage.setItem(WALLET_CACHE_KEY, JSON.stringify(session));
  } catch {
    // non-fatal — next load just won't have the fast path
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProvisioningWallet, setIsProvisioningWallet] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  /**
   * Email currently (or already) provisioned. onAuthStateChange fires for
   * INITIAL_SESSION, SIGNED_IN, and hourly TOKEN_REFRESHED events — without
   * this guard each of those re-ran the full Circle handshake (and the
   * initial getSession + INITIAL_SESSION pair doubled it on every load).
   */
  const provisionedEmailRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    async function provisionFor(email: string) {
      if (provisionedEmailRef.current === email) return;
      provisionedEmailRef.current = email;
      setSessionError(null);

      // Fast path: show the cached wallet immediately; refresh in background.
      const cached = readWalletCache();
      const hasCache = cached !== null && cached.email === email;
      if (hasCache) {
        setSession(cached);
        setIsLoading(false);
      } else {
        // No cache: this is a first-time provision (or first time on this
        // device) — the slow, on-chain wallet-creation path. Signal it so the
        // UI can explain the wait instead of showing nothing.
        setIsProvisioningWallet(true);
      }

      try {
        const wallet = await getOrCreateWallet(email);
        if (cancelled) return;
        const next: Session = { email: wallet.email, address: wallet.address };
        setSession(next);
        writeWalletCache(next);
      } catch (err) {
        if (cancelled) return;
        console.error("Wallet provisioning failed:", err);
        provisionedEmailRef.current = null; // allow a retry on the next auth event
        if (!hasCache) {
          // No known wallet — surface the failure.
          setSession(null);
          setSessionError("Something went wrong setting up your wallet. Please try again.");
        }
        // With a cached wallet, stay signed in silently — the Circle session
        // refresh will be retried when a transaction actually needs it.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsProvisioningWallet(false);
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const email = data.session?.user.email;
      if (email) {
        provisionFor(email);
      } else {
        setSession(null);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      const email = authSession?.user.email;
      if (email) {
        provisionFor(email);
      } else {
        provisionedEmailRef.current = null;
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
    try {
      window.localStorage.removeItem(WALLET_CACHE_KEY);
    } catch {
      // ignore
    }
    await supabaseBrowser().auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, isProvisioningWallet, sessionError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
