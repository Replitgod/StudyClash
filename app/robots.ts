import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyclash.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin"],
      },
      {
        userAgent: [
          "Googlebot",
          "Googlebot-News",
          "Bingbot",
          "DuckDuckBot",
          "Applebot",
          "Google-Extended",
          "GPTBot",
          "OAI-SearchBot",
          "ClaudeBot",
          "Claude-SearchBot",
          "PerplexityBot",
        ],
        allow: ["/", "/pricing", "/exams", "/demo/battle", "/create", "/contact"],
        disallow: ["/api/", "/admin"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
