import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://acedecks.org";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AceDecks - AI Study App",
    short_name: "AceDecks",
    description:
      "AI study app for competitive learning, flashcard battles, and exam-focused practice.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050506",
    theme_color: "#050506",
    categories: ["education", "productivity"],
    lang: "en-US",
    orientation: "portrait-primary",
    // app/icon.svg is picked up by Next's file convention and injected into
    // <head>; listing it here as well is what makes it the installed-app
    // icon rather than only the browser tab icon.
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Start studying",
        short_name: "Study",
        description: "Add material and start a study session",
        url: "/home",
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
        description: "Compare Free and paid plans",
        url: "/pricing",
      },
    ],
    id: `${siteUrl}/`,
  };
}
