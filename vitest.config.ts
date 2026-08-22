import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // "**/node_modules/**" rather than "node_modules": the bare form only
    // matches the top-level directory, so vitest was collecting (and
    // failing on) test files shipped inside my-study-app's dependencies.
    exclude: ["**/node_modules/**", "**/.next/**", "my-study-app/**"],
  },
});
