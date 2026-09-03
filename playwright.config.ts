import { defineConfig, devices } from "@playwright/test";

/**
 * Two kinds of person, one panel.
 *
 * The internal panel is for the team, and the same application carries the
 * client's own view of their project. The specs are almost entirely about what
 * each of them **cannot** reach, because that is the half nobody notices
 * breaking: a screen that stops working is reported within the hour, and a
 * client who can see an internal note is reported never.
 *
 * **The staff session is borrowed rather than signed in.** That account is the
 * owner's own — the same login that reaches the company website and every
 * client's data — so its password is deliberately nowhere a test can read it.
 * `save-admin-session.mjs` saves one by hand, and the specs skip with that
 * instruction when it has expired. A session that expires is the price of not
 * writing the owner's password into a file, and it is the right way round.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  timeout: 30_000,

  /*
    Ten seconds, not the default five. The suite runs against a Next dev server,
    which compiles a route the first time it is asked for — under parallel
    projects that compile lands inside somebody's assertion. Learned in the
    tracker's harness the same week, where the failure moved between three
    different tests across three runs.
  */
  expect: { timeout: 10_000 },
  workers: 3,

  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "staff",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/staff.json" },
      testMatch: /staff\.spec\.ts/,
    },
    {
      name: "client",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/client.json" },
      testMatch: /client\.spec\.ts/,
    },
    {
      name: "responsive",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/staff.json" },
      testMatch: /responsive\.spec\.ts/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
  },
});
