import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studyclash.com";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StudyClash - AI Study App",
    short_name: "StudyClash",
    description:
      "AI study app for competitive learning, flashcard battles, and exam-focused practice.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#04070f",
    theme_color: "#04070f",
    categories: ["education", "productivity"],
    lang: "en-US",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48 32x32 16x16",
        type: "image/x-icon",
      },
    ],
    shortcuts: [
      {
        name: "Create Deck",
        short_name: "Create",
        description: "Upload notes and generate AI questions",
        url: "/create",
      },
      {
        name: "Demo Battle",
        short_name: "Demo",
        description: "Try an instant AI study battle",
        url: "/demo/battle",
      },
      {
        name: "Pricing",
        short_name: "Pricing",
        description: "Compare Free Beta and paid plans",
        url: "/pricing",
      },
    ],
    id: `${siteUrl}/`,
  };
}
