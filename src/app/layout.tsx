import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
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
  themeColor: "#f5f4f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
