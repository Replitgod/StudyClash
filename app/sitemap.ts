import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyjoust.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes: Array<{
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly";
    priority: number;
  }> = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.95 },
    { path: "/exams", changeFrequency: "weekly", priority: 0.9 },
    { path: "/exams/sat", changeFrequency: "weekly", priority: 0.88 },
    { path: "/exams/ap", changeFrequency: "weekly", priority: 0.88 },
    { path: "/exams/mcat", changeFrequency: "weekly", priority: 0.84 },
    { path: "/exams/lsat", changeFrequency: "weekly", priority: 0.84 },
    { path: "/exams/nclex", changeFrequency: "weekly", priority: 0.84 },
    { path: "/create", changeFrequency: "weekly", priority: 0.88 },
    { path: "/demo/battle", changeFrequency: "weekly", priority: 0.86 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.78 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.35 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.35 },
    { path: "/clashrank", changeFrequency: "weekly", priority: 0.74 },
    { path: "/classroom", changeFrequency: "weekly", priority: 0.72 },
    { path: "/mastery-map", changeFrequency: "weekly", priority: 0.66 },
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
