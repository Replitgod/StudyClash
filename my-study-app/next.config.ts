import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parent folder has its own package-lock.json, so Turbopack can't infer
  // which directory is the app root. Pin it to this project.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
