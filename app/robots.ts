import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Only the landing page is content worth indexing. Everything past it is a
 * writable application surface, not a page a search result should land
 * someone on — and the reset endpoint under /api must never be crawled.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/operator", "/inventory", "/purchasing", "/sales", "/warehousing", "/analytics", "/admin", "/settings", "/approvals", "/notifications", "/import"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
