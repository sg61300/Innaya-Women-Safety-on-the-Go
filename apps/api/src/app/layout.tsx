import type { Metadata, Viewport } from "next";

// Root layout for the Next.js app router. Kept visually neutral so it can host
// both the light guardian status page (g/[token], which now paints its own
// ground) and the dark INNAYA products site (products/*, with its own layout).
// API routes under app/api do not use it.
// robots: the public campaign page "/" and the products site are indexable
// (founder ruling 2026-09-24 campaign). Pages that must stay out of search
// (g/[token], tester-terms) set their own noindex metadata; the X-Robots-Tag
// header (next.config → securityHeaders) and public/robots.txt are the other
// two layers.
export const metadata: Metadata = {
  title: "INNAYA",
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0B0B0C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Fraunces:opsz,wght@9..144,400..600&family=Manrope:wght@400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
