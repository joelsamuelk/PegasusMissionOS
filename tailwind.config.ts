import type { Config } from "tailwindcss";

/**
 * Pegasus Mission OS design tokens.
 *
 * Colours are exposed as CSS custom properties in `src/styles/globals.css`
 * (see `:root`) and referenced here so the palette can be themed at runtime
 * without recompiling. The system is deliberately restrained: a warm editorial
 * paper, near-black ink, precise borders, and a single architectural accent.
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
        "accent-contrast": "var(--color-accent-contrast)",
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
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.12em" }],
        "display-lg": ["3.25rem", { lineHeight: "1.04", letterSpacing: "-0.02em" }],
        display: ["2.5rem", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        "heading-lg": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        heading: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        title: ["1.0625rem", { lineHeight: "1.35", letterSpacing: "-0.005em" }],
      },
      spacing: {
        gutter: "1.5rem",
        section: "2.5rem",
      },
      borderRadius: {
        xs: "3px",
        sm: "5px",
        DEFAULT: "7px",
        md: "9px",
        lg: "12px",
      },
      boxShadow: {
        "elev-1": "0 1px 2px 0 rgba(20, 22, 27, 0.04), 0 1px 1px 0 rgba(20, 22, 27, 0.03)",
        "elev-2": "0 2px 4px -1px rgba(20, 22, 27, 0.06), 0 1px 2px -1px rgba(20, 22, 27, 0.04)",
        "elev-3": "0 12px 32px -12px rgba(20, 22, 27, 0.18), 0 2px 6px -2px rgba(20, 22, 27, 0.08)",
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
