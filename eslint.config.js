import tseslint from "typescript-eslint";
import js from "@eslint/js";

export default tseslint.config(
  // Global linter settings
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },

  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.vite/**",
      "**/data/**",
      "**/uploads/**",
      "deploy/**",
      ".railway/**",
      "eslint.config.js",
    ],
  },

  // Base recommended configs
  js.configs.recommended,

  // Type-checked rules for source files (exclude tests and configs)
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/vitest.config.ts", "**/vite.config.ts", "**/vite-env.d.ts"],
  })),

  // Non-type-checked rules for test files and build configs
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.test.ts", "**/*.test.tsx", "**/vitest.config.ts", "**/vite.config.ts", "**/vite-env.d.ts"],
  })),

  // Source TypeScript rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/vitest.config.ts", "**/vite.config.ts", "**/vite-env.d.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": [
        "warn",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "no-console": "warn",
      "no-debugger": "error",
      // Rules referenced in eslint-disable comments (plugins not installed)
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },

  // Server: allow console, any
  {
    files: ["apps/server/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },

  // Test files: relaxed
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "no-console": "off",
    },
  },
);
