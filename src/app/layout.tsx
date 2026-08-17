import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { nunitoSans, quicksand } from "@/app/fonts";
import { ToastProvider } from "@/components/shared/Toast";

export const metadata: Metadata = {
  title: {
    default: "Pegasus Mission OS",
    template: "%s | Pegasus Mission OS",
  },
  description:
    "The operating system for mission-driven organisations. Discover funding, manage grant applications, run programmes, track outcomes and demonstrate impact.",
  applicationName: "Pegasus Mission OS",
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
