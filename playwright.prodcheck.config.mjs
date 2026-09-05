import { devices } from "@playwright/test";

export default {
  testDir: "./tests/prodcheck",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    launchOptions: { executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" },
    ...devices["Desktop Chrome"],
  },
};
