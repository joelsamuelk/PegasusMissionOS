import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// --- Button -------------------------------------------------------------

/**
 * Buttons follow the Pegasus Studio brand: fully rounded pills, with the blue
 * and coral variants carrying the studio's inner highlight over a coloured
 * halo. `blue` is the call to action, `primary` navy is the workhorse inside
 * the application chrome, and coral (`accent`) is held back for the brand mark
 * and small non-interactive accents.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-fast ease-calm disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ink-inverse hover:bg-ink/90",
        accent:
          "border border-accent/45 bg-accent text-accent-contrast shadow-coral hover:shadow-coral-hover",
        blue: "border border-blue/45 bg-blue text-white shadow-brand-blue hover:shadow-brand-blue-hover",
        secondary:
          "border border-line-strong bg-surface text-ink hover:border-blue hover:text-blue",
        ghost: "text-ink hover:bg-surface-sunken",
        subtle: "bg-surface-sunken text-ink hover:bg-line",
        danger: "border border-critical/40 bg-critical-soft text-critical hover:bg-critical/15",
        link: "text-info underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3.5 text-[0.8125rem]",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-[0.9375rem]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & { className?: string };

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonBaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export function ButtonLink({
  className,
  variant,
  size,
  href,
  ...props
}: ButtonBaseProps & { href: string } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };

// --- Card / surface -----------------------------------------------------

export function Card({
  className,
  as: Tag = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <Tag
      className={cn("surface-card shadow-elev-1 transition-shadow ease-calm", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 border-b border-line px-5 py-4", className)}
      {...props}
    />
  );
}

// --- Typography helpers -------------------------------------------------

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("eyebrow", className)} {...props} />;
}

export function SectionTitle({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <h2 className="font-heading text-title font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

// --- Pill / tag ---------------------------------------------------------

export function Pill({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-0.5 text-xs text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

// --- Divider ------------------------------------------------------------

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
