import { defineConfig, devices } from "@playwright/test";

// Runs against a locally-started dev server (webServer below), not the live
// production site -- these are smoke tests for public, unauthenticated
// flows that don't need real Supabase/OpenAI credentials to exercise the UI
// shell, since the fallback question pools cover generation failures.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 1,
  // Several specs exercise real AI question generation (OpenAI round-trips
  // per question, sometimes with a retry-with-correction pass) rather than
  // mocking it, so the default 30s per-test budget is too tight.
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
