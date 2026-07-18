import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Belt-and-suspenders alongside require.resolve() in
  // app/api/import/anki/route.ts: that route reads sql.js's .wasm binary
  // at runtime, and while require.resolve is what lets Vercel's file tracer
  // find it automatically, explicitly declaring it here means a build stays
  // correct even if a future dependency bump changes how that tracer
  // resolves the call.
  outputFileTracingIncludes: {
    "/api/import/anki": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  // @napi-rs/canvas ships a native .node binary addon (loaded via
  // js-binding.js) that Turbopack can't bundle as an ES module -- this
  // tells Next.js to require() it at runtime in the Node.js server
  // environment instead of bundling it, which is the standard fix for
  // native-binary packages (same category as sharp, better-sqlite3, etc.).
  // Used by lib/server/curriculum/extraction.ts to render a scanned PDF
  // page to an image before OCR.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
