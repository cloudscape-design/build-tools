// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { env } from "node:process";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      enabled: env.CI === "true",
      provider: "istanbul",
      include: ["src/**"],
      exclude: ["**/debug-tools/**", "**/test/**"],
    },
  },
});
