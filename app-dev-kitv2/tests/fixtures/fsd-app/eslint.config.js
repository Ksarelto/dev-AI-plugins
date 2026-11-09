import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .factory holds the factory's own files (the living prototype's browser JS), not app code.
  { ignores: ["dist", "node_modules", "coverage", ".factory"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  { files: ["**/*.cjs"], languageOptions: { globals: globals.node, sourceType: "commonjs" } },
);
