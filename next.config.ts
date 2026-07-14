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
};

export default nextConfig;
