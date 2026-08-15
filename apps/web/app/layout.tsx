import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Archivo at 400/600/800, matching the Modernist system. Self-hosted through
 * next/font rather than the stylesheet's Google import: no render-blocking
 * request, no layout shift, and it keeps working offline.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoScout — used-car listing triage",
  description:
    "Scores Facebook Marketplace listings against similar asking prices nearby, flags the risks, and drafts the message you send the seller.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-screen">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border-2 focus:border-divider focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
