import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/browser-smoke.spec.mjs",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: ".preview/frontend-smoke/test-results",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    launchOptions: { executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/browser-server.mjs",
    url: "http://127.0.0.1:3000/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
