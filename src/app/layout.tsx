import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { envResult } from "@/lib/env";
import { ConfigError } from "@/components/ConfigError";
import { AuthProvider } from "@/lib/auth-context";
import { WalletProvisioningOverlay } from "@/components/WalletProvisioningOverlay";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const TITLE = "RentPact — Rent held in escrow, released on schedule";
const DESCRIPTION =
  "USDC rent escrow for tenants and landlords. Rent held in escrow, released on schedule, frozen on dispute — no bank, no lawyer, no trust required.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rentpact.xyz"),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RentPact",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "RentPact",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B3D2E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <head>
        {/* Warm the connection to Circle's wallet host so the W3S SDK's first
            request (and its hosted PIN UI) isn't delayed by a cold TLS/DNS
            handshake — a contributor to the intermittent desktop 155706. */}
        <link rel="preconnect" href="https://pw-auth.circle.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://pw-auth.circle.com" />
      </head>
      <body className="bg-cream font-sans text-ink antialiased">
        {envResult.success ? (
          <AuthProvider>
            {children}
            <WalletProvisioningOverlay />
          </AuthProvider>
        ) : (
          <ConfigError result={envResult} />
        )}
      </body>
    </html>
  );
}
