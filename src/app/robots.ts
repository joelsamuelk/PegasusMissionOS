import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

/**
 * The marketing site is the only thing worth indexing.
 *
 * The application routes serve a seeded demo workspace for a fictional
 * charity. Indexing them would put sample data into search results under this
 * domain, where it would be read as a real organisation's records — the exact
 * confusion every "sample data" label in the product exists to prevent.
 */
const APPLICATION_ROUTES = [
  "/dashboard",
  "/relationships",
  "/funding",
  "/applications",
  "/grants",
  "/programmes",
  "/impact",
  "/evidence",
  "/organisation",
  "/team",
  "/settings",
  "/onboarding",
  "/login",
  "/signup",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: APPLICATION_ROUTES.map((route) => `${route}/`).concat(APPLICATION_ROUTES),
    },
    sitemap: `${appConfig.marketingUrl}/sitemap.xml`,
  };
}
