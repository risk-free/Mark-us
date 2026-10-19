import type { MetadataRoute } from "next";

import { postsByDateDescending } from "@/content/posts";
import { LOCALES } from "@/i18n/locales";
import { absoluteUrl } from "@/lib/site";

/**
 * Sitemap covering every locale for every route (SCHEDULE 1.4).
 *
 * Because `localePrefix: "always"` gives each locale a distinct URL, each entry
 * carries `alternates.languages` so crawlers see the full set without guessing
 * from `x-default` alone. `alternates.languages` must be absolute URLs.
 */
const STATIC_ROUTES = ["", "/about", "/services", "/cases", "/blog"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const path of STATIC_ROUTES) {
    for (const locale of LOCALES) {
      const pathname = `/${locale}${path}`;
      entries.push({
        url: absoluteUrl(pathname),
        changeFrequency: path === "/blog" ? "weekly" : "monthly",
        priority: path === "" ? 1 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((code) => [code, absoluteUrl(`/${code}${path}`)]),
          ),
        },
      });
    }
  }

  for (const post of postsByDateDescending) {
    for (const locale of LOCALES) {
      const pathname = `/${locale}/blog/${post.slug}`;
      entries.push({
        url: absoluteUrl(pathname),
        lastModified: new Date(`${post.publishedAt}T00:00:00Z`),
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((code) => [code, absoluteUrl(`/${code}/blog/${post.slug}`)]),
          ),
        },
      });
    }
  }

  return entries;
}