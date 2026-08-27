import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const localEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const localChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const localExecutable = process.platform === "win32" ? [localEdge, localChrome].find(existsSync) : undefined;
const launchOptions = localExecutable ? { executablePath: localExecutable } : {};

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/browser-smoke.spec.mjs", "**/mobile-browser-smoke.spec.mjs", "**/browser-agent-smoke.spec.mjs", "**/workspace-edit-e2e.spec.mjs"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: ".preview/frontend-smoke/test-results",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    launchOptions,
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
