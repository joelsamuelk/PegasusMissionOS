import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

/**
 * Two public URLs, listed honestly.
 *
 * The marketing page's sections are in-page anchors rather than routes, so
 * there is nothing else to declare. Padding a sitemap with fragment URLs does
 * not create pages; it creates duplicates of one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: appConfig.marketingUrl,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${appConfig.marketingUrl}/legal`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
