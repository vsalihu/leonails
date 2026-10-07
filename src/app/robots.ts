import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

/** SITE_NOINDEX=true keeps a temporary or staging deployment out of search engines. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_NOINDEX === "true") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/appointment/", "/review/", "/api/"] } };
}
