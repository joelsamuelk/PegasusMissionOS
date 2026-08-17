import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { nunitoSans, quicksand } from "@/app/fonts";
import { appConfig } from "@/lib/config";
import { ToastProvider } from "@/components/shared/Toast";

/**
 * `metadataBase` is the *marketing* origin, not the application one. Canonical
 * URLs, OpenGraph URLs and the sitemap all describe the public site, which in
 * production runs on a different host from the app. Both are configuration
 * (`NEXT_PUBLIC_MARKETING_URL` / `NEXT_PUBLIC_APP_URL`) so neither host is
 * written into a component.
 */
export const metadata: Metadata = {
  metadataBase: new URL(appConfig.marketingUrl),
  title: {
    default: "Pegasus Mission OS",
    template: "%s | Pegasus Mission OS",
  },
  description:
    "The operating system for mission-driven organisations. Connect funding, programmes, finances, relationships, evidence and reporting in one intelligent system.",
  applicationName: "Pegasus Mission OS",
  authors: [{ name: "Pegasus Information Studio", url: appConfig.studioUrl }],
  creator: "Pegasus Information Studio",
  publisher: "Pegasus Information Studio",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#fffcfa",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-GB"
      className={`${nunitoSans.variable} ${quicksand.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {/* Scroll-reveal content rests at opacity 0 until JS observes it. */}
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
