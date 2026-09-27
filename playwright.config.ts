import { defineConfig } from "@playwright/test";

const PORT = 4173;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "node apps/server/dist/index.js",
        url: `http://localhost:${PORT}/healthz`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          PORT: String(PORT),
          DATABASE_URL: `file:./test-results/e2e-${Date.now()}.db`,
          SESSION_SECRET: "e2e-secret-0123456789abcdefghijklmnop",
        },
      },
});
