import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests: node environment, no DOM.
 *
 * Everything tested here is a pure function — the rules that decide what a
 * person may reach, what a percentage means, how a name is made safe. Those are
 * the things worth pinning, and none of them needs a browser.
 *
 * What happens in a browser is tested in a browser, by Playwright.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
