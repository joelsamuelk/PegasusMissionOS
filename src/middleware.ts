import { NextRequest, NextResponse } from "next/server";
import { domainConfig, domainUrls, resolveSurface } from "@/lib/domains";
import { refreshAuthSession } from "@/server/data/supabase/middleware";

const APP_PREFIXES = [
  "/dashboard",
  "/funding",
  "/applications",
  "/grants",
  "/programmes",
  "/relationships",
  "/evidence",
  "/impact",
  "/organisation",
  "/team",
  "/settings",
  "/onboarding",
  "/login",
  "/signup",
  "/auth",
];
const MARKETING_PREFIXES = ["/product", "/legal"];

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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

async function finish(
  request: NextRequest,
  response: NextResponse,
  surface: string,
): Promise<NextResponse> {
  surfaceHeader(response, surface);
  if (surface === "customer_app" || surface === "preview") {
    await refreshAuthSession(request, response);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const surface = resolveSurface(
    forwardedHost ?? request.headers.get("host"),
    domainConfig,
  );
  const { pathname } = request.nextUrl;

  if (surface === "unknown") return notFound(surface);
  if (surface === "preview") return finish(request, NextResponse.next(), surface);

  if (surface === "marketing") {
    if (pathname.startsWith("/control")) return notFound(surface);
    if (startsWithAny(pathname, APP_PREFIXES)) {
      return surfaceHeader(
        NextResponse.redirect(domainUrls.app(`${pathname}${request.nextUrl.search}`)),
        surface,
      );
    }
    return finish(request, NextResponse.next(), surface);
  }

  if (surface === "customer_app") {
    if (pathname.startsWith("/control")) return notFound(surface);
    if (pathname === "/") {
      // Authentication remains the dashboard layout's responsibility;
      // hostname classification never grants a user or tenant context.
      return finish(
        request,
        NextResponse.redirect(domainUrls.app("/dashboard")),
        surface,
      );
    }
    if (startsWithAny(pathname, MARKETING_PREFIXES)) {
      return surfaceHeader(
        NextResponse.redirect(
          domainUrls.marketing(`${pathname}${request.nextUrl.search}`),
        ),
        surface,
      );
    }
    return finish(request, NextResponse.next(), surface);
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|og.png).*)",
  ],
};
