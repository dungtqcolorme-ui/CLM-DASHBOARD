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
    "dist/**",
    ".wrangler/**",
    "next-env.d.ts",
    // Pinned, unmodified third-party Motion runtime; provenance and MIT license beside it.
    "public/creative-os/vendor/**",
  ]),
]);

export default eslintConfig;
