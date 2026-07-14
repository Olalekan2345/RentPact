import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { envResult } from "@/lib/env";
import { ConfigError } from "@/components/ConfigError";
import { AuthProvider } from "@/lib/auth-context";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body className="bg-cream font-sans text-ink antialiased">
        {envResult.success ? <AuthProvider>{children}</AuthProvider> : <ConfigError result={envResult} />}
      </body>
    </html>
  );
}
