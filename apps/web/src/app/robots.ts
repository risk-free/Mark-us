import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/**
 * The two public GATE surfaces are crawlable — they are the product's public
 * entry points and are already anonymous. Nothing else in the app is: `/portal`,
 * `/expert`, `/crm` and `/admin` belong to later phases, do not exist yet, and
 * must never be advertised as crawlable URLs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/portal", "/expert", "/crm", "/admin", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").slice(0, -1),
  };
}