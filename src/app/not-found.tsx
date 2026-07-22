import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/shared/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Link href="/" className="mb-8">
        <Wordmark showProduct size="lg" />
      </Link>
      <div className="eyebrow mb-3">Error 404</div>
      <h1 className="text-heading-lg font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        The page you are looking for does not exist or may have moved.
      </p>
      <ButtonLink href="/dashboard" className="mt-6">
        Go to Command Centre
      </ButtonLink>
    </div>
  );
}
