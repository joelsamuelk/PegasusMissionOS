import localFont from "next/font/local";

/**
 * Brand typefaces, matching pegasus-studio.co: Quicksand for headings and the
 * wordmark, Nunito Sans for body copy.
 *
 * Both are vendored as variable woff2 (latin subset) under `public/fonts`, so
 * neither the build nor the runtime depends on a font CDN.
 */
export const quicksand = localFont({
  src: "../../public/fonts/Quicksand-latin.woff2",
  weight: "300 700",
  style: "normal",
  variable: "--font-quicksand",
  display: "swap",
  fallback: ["ui-rounded", "Avenir Next", "Segoe UI", "system-ui", "sans-serif"],
});

export const nunitoSans = localFont({
  src: "../../public/fonts/Nunito-Sans-latin.woff2",
  weight: "200 900",
  style: "normal",
  variable: "--font-nunito-sans",
  display: "swap",
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});
