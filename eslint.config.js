import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The dependency rule from docs/superpowers/specs/2026-08-14-junkclaw-architecture-design.md:
 *
 *     agents -> core -> schema
 *
 * Never backwards. `core` holds the valuation math and must stay testable
 * without a model and portable off Mastra, so it may not import agents, Next,
 * or the extension. This is lint-enforced, not a convention we remember.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/.output/**", "**/.wxt/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Not-yet-implemented steps keep their real signatures with `_`-prefixed
      // parameters, so the contract is readable before the body exists.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/schema/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@junkclaw/*"],
              message:
                "schema is the base of the dependency chain and imports no other workspace package.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@junkclaw/agents", "@junkclaw/db", "@mastra/*", "ai", "next", "next/*"],
              message:
                "core is deterministic domain logic: no Mastra, no Next, no DB. It may import @junkclaw/schema only.",
            },
          ],
        },
      ],
    },
  },
);
