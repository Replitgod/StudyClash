import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/settings",
          "/home",
          "/study/",
          "/battle/",
          "/challenge/",
          "/results/",
          "/library",
          "/practice",
          "/vyra",
          "/classroom/join",
          "/login",
          "/signup",
          // Signed-in surfaces that render a sign-in wall to a crawler.
          // Listing them here keeps crawl budget on the pages that say
          // something; they are also absent from sitemap.ts, so the two
          // files agree. /classroom, /exams and /diagnostics are NOT here
          // -- those are real public pages.
          "/mastery-map",
          "/clashrank",
          "/friends",
          "/study-plans",
          "/curriculum",
        ],
        // /d/ is deliberately absent from the disallow list: published study
        // sets are the point of the sitemap and the only app-side pages
        // written to be indexed.
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
