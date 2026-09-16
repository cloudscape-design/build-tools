// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import headerPlugin from "@tony.ganchev/eslint-plugin-header";
import eslintPrettier from "eslint-plugin-prettier/recommended";
import unicornPlugin from "eslint-plugin-unicorn";
import globals from "globals";
import path from "node:path";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  includeIgnoreFile(path.resolve(".gitignore")),
  { ignores: ["lib/**"] },
  eslint.configs.recommended,
  tsEslint.configs.recommended,
  eslintPrettier,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      unicorn: unicornPlugin,
      header: headerPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-warning-comments": "warn",
      "header/header": [
        "error",
        "line",
        [" Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.", " SPDX-License-Identifier: Apache-2.0"],
      ],
    },
  },
);
