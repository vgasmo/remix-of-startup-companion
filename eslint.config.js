import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default [
  // ignore build output and Node.js scripts from TS/React linting
  { ignores: ["dist", "scripts/**", "e2e/**/*.cjs", "supabase/functions/mcp/index.ts"] }, // mcp bundle is auto-generated

  // base recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ✅ Project-wide TS overrides (put AFTER recommended so they win)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-control-regex": "off",
      "no-useless-escape": "off",
      "prefer-const": "off",
      "no-case-declarations": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": ["error", {
        "patterns": [
          {
            "group": ["**/integrations/supabase/client", "**/integrations/supabase/client.ts"],
            "message": "Use the secure wrapper from @/lib/supabaseClient instead. The auto-generated client lacks PKCE and detectSessionInUrl."
          }
        ]
      }],
    },
  },

  // ✅ React hooks rules for BOTH .ts and .tsx (custom hooks live in .ts files
  //    too — e.g. src/hooks/*.ts — and rules-of-hooks / exhaustive-deps must
  //    apply there. Suppressions like `// eslint-disable-next-line
  //    react-hooks/exhaustive-deps` in .ts files require the rule to be
  //    registered even when it is disabled here.)
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },

  // e2e — no React hooks
  {
    files: ["e2e/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },

  // supabase functions — not React
  {
    files: ["supabase/functions/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
