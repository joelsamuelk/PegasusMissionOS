import type { Config } from "tailwindcss";

/**
 * Pegasus Mission OS design tokens.
 *
 * Colours are exposed as CSS custom properties in `src/styles/globals.css`
 * (see `:root`) and referenced here so the palette can be themed at runtime
 * without recompiling. The system follows the Pegasus Studio brand
 * (pegasus-studio.co): warm off-white paper, deep navy ink, a coral primary
 * and a studio blue secondary, generous radii and low, warm shadows.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--color-paper)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        "surface-sunken": "var(--color-surface-sunken)",
        ink: "var(--color-ink)",
        "ink-muted": "var(--color-ink-muted)",
        "ink-subtle": "var(--color-ink-subtle)",
        "ink-inverse": "var(--color-ink-inverse)",
        line: "var(--color-line)",
        "line-strong": "var(--color-line-strong)",
        accent: "var(--color-accent)",
        "accent-muted": "var(--color-accent-muted)",
        "accent-soft": "var(--color-accent-soft)",
        // Deepened coral for coral *text* on light surfaces (AA contrast).
        "accent-ink": "var(--color-accent-ink)",
        "accent-contrast": "var(--color-accent-contrast)",
        blue: "var(--color-blue)",
        "blue-soft": "var(--color-blue-soft)",
        success: "var(--color-success)",
        "success-soft": "var(--color-success-soft)",
        warning: "var(--color-warning)",
        "warning-soft": "var(--color-warning-soft)",
        critical: "var(--color-critical)",
        "critical-soft": "var(--color-critical-soft)",
        info: "var(--color-info)",
        "info-soft": "var(--color-info-soft)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
        // Alias kept so any lingering `font-serif` still renders in the brand
        // display face rather than falling back to a system serif.
        serif: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.14em" }],
        "display-lg": ["3.5rem", { lineHeight: "1.04", letterSpacing: "-0.03em" }],
        display: ["2.5rem", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        "heading-lg": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        heading: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        title: ["1.0625rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
      },
      spacing: {
        gutter: "1.5rem",
        section: "2.5rem",
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        DEFAULT: "10px",
        md: "14px",
        lg: "18px",
        xl: "24px",
        "2xl": "28px",
      },
      boxShadow: {
        "elev-1": "0 1px 2px 0 rgba(20, 33, 61, 0.04), 0 1px 3px 0 rgba(20, 33, 61, 0.03)",
        "elev-2": "0 8px 20px -8px rgba(20, 33, 61, 0.10), 0 2px 6px -2px rgba(20, 33, 61, 0.06)",
        "elev-3": "0 18px 44px -16px rgba(20, 33, 61, 0.22), 0 4px 12px -4px rgba(20, 33, 61, 0.10)",
        // The studio's card lift on hover.
        card: "0 14px 32px rgba(20, 33, 61, 0.08)",
        // The studio's pill-button glows: an inner highlight over a coloured halo.
        coral:
          "inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 1px 1px rgba(20, 33, 61, 0.14), 0 10px 22px rgba(255, 87, 87, 0.24), 0 16px 40px -14px rgba(255, 87, 87, 0.42)",
        "coral-hover":
          "inset 0 1px 0 rgba(255, 255, 255, 0.42), 0 1px 1px rgba(20, 33, 61, 0.16), 0 12px 26px rgba(255, 87, 87, 0.30), 0 20px 46px -14px rgba(255, 87, 87, 0.5)",
        "brand-blue":
          "inset 0 1px 0 rgba(255, 255, 255, 0.34), 0 1px 1px rgba(20, 33, 61, 0.16), 0 10px 24px rgba(48, 121, 216, 0.28), 0 18px 44px -16px rgba(48, 121, 216, 0.5)",
        "brand-blue-hover":
          "inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 1px rgba(20, 33, 61, 0.18), 0 12px 28px rgba(48, 121, 216, 0.34), 0 22px 50px -16px rgba(48, 121, 216, 0.58)",
        focus: "0 0 0 3px var(--color-accent-ring)",
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "180ms",
        slow: "280ms",
      },
      transitionTimingFunction: {
        calm: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

export default config;
