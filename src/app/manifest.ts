import type { MetadataRoute } from "next";

// Installable-PWA manifest (Next serves this at /manifest.webmanifest). Purely
// additive: it lets RentPact install to the home screen and run standalone.
// No service worker here — offline/push are a separate, later decision.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RentPact — rent held in escrow",
    short_name: "RentPact",
    description:
      "USDC rent escrow — rent held in escrow, released on schedule, frozen on dispute. No bank, no lawyer, no trust required.",
    start_url: "/",
    display: "standalone",
    background_color: "#FDFCFA",
    theme_color: "#0B3D2E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
