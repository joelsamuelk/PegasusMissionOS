import { NextRequest, NextResponse } from "next/server";
import { domainConfig, domainUrls, resolveSurface } from "@/lib/domains";

const APP_PREFIXES = [
  "/dashboard", "/funding", "/applications", "/grants", "/programmes",
  "/relationships", "/evidence", "/impact", "/organisation", "/team",
  "/settings", "/onboarding", "/login", "/signup",
];
const MARKETING_PREFIXES = ["/product", "/legal"];

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function surfaceHeader(response: NextResponse, surface: string): NextResponse {
  response.headers.set("x-pegasus-surface", surface);
  if (surface === "customer_app" || surface === "control_plane") {
    response.headers.set("x-robots-tag", "noindex, nofollow");
  }
  return response;
}

function notFound(surface: string): NextResponse {
  return surfaceHeader(
    new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
    }),
    surface,
  );
}

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const surface = resolveSurface(forwardedHost ?? request.headers.get("host"), domainConfig);
  const { pathname } = request.nextUrl;

  if (surface === "unknown") return notFound(surface);
  if (surface === "preview") return surfaceHeader(NextResponse.next(), surface);

  if (surface === "marketing") {
    if (pathname.startsWith("/control")) return notFound(surface);
    if (startsWithAny(pathname, APP_PREFIXES)) {
      return surfaceHeader(NextResponse.redirect(domainUrls.app(pathname)), surface);
    }
    return surfaceHeader(NextResponse.next(), surface);
  }

  if (surface === "customer_app") {
    if (pathname.startsWith("/control")) return notFound(surface);
    if (pathname === "/") {
      // The demo has no session cookie. Live authentication remains the
      // dashboard layout's responsibility; hostname never grants a context.
      return surfaceHeader(NextResponse.redirect(domainUrls.app("/dashboard")), surface);
    }
    if (startsWithAny(pathname, MARKETING_PREFIXES)) {
      return surfaceHeader(NextResponse.redirect(domainUrls.marketing(pathname)), surface);
    }
    return surfaceHeader(NextResponse.next(), surface);
  }

  if (surface === "control_plane") {
    if (pathname === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = "/control";
      return surfaceHeader(NextResponse.rewrite(destination), surface);
    }
    if (!pathname.startsWith("/control")) return notFound(surface);
    return surfaceHeader(NextResponse.next(), surface);
  }

  return notFound(surface);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|og.png).*)"],
};
