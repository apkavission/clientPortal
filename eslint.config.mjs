import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
      And wherever a verification build lands.

      `next.config.ts` honours `NEXT_DIST_DIR` so a production build can be made
      without overwriting the manifest the dev server is reading. The output is
      still compiled JavaScript, and eslint has no idea it is not source: one
      verification build turned a clean lint into **7,470 problems** — 395 of
      them errors, every one of them in a bundle nobody wrote. Glob rather than
      a fixed name, because the point of the variable is that the name varies.
    */
    ".next-*/**",
  ]),
]);

export default eslintConfig;
