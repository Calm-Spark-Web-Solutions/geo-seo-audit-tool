import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config. Kept deliberately small: no React/JSX tests this pass,
 * `lib/**` is the only tested surface, and `node` is the default
 * environment because every helper under test is pure or DOM-free
 * (cheerio operates on raw HTML strings without a window).
 *
 * The `@/*` alias mirrors `tsconfig.json` so production import paths
 * work in tests verbatim.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // happy-dom is installed for the rare per-file override
    // (`// @vitest-environment happy-dom`) but never the default.
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/*.test.ts",
        "lib/supabase/**",
        "**/*.config.*",
        "**/index.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
