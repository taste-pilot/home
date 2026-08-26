import { defineConfig } from "@playwright/test";

// Browser-based tests (visual QA, PDF) arrive with the renderer milestones.
export default defineConfig({
  testDir: "tests/browser",
  use: {
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
