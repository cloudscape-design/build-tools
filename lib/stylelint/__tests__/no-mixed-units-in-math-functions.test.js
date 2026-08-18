// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import stylelint from "stylelint";

import { configBasedir } from "./common.js";

const css = String.raw;

function runPlugin(code) {
  return stylelint.lint({
    code,
    configBasedir,
    config: {
      plugins: ["../no-mixed-units-in-math-functions.js"],
      rules: {
        "@cloudscape-design/no-mixed-units-in-math-functions": [true],
      },
    },
  });
}

describe("no-mixed-units-in-math-functions rule", () => {
  describe("accepts valid usage", () => {
    test("max/min/clamp with same units", async () => {
      const maxResult = await runPlugin(css`
        .a { inline-size: max(24px, 48px); }
      `);
      const minResult = await runPlugin(css`
        .b { inline-size: min(50%, 100%); }
      `);
      const clampResult = await runPlugin(css`
        .c { inline-size: clamp(200px, 500px, 800px); }
      `);
      expect(maxResult.errored).toBe(false);
      expect(minResult.errored).toBe(false);
      expect(clampResult.errored).toBe(false);
    });

    test("max/min/clamp with nested calc, all same units", async () => {
      const maxPx = await runPlugin(css`
        .a { inline-size: max(0px, calc(100px - 12px)); }
      `);
      const maxPercent = await runPlugin(css`
        .b { inline-size: max(50%, calc(100% / 3)); }
      `);
      const minRem = await runPlugin(css`
        .c { inline-size: min(10rem, calc(20rem - 2rem)); }
      `);
      expect(maxPx.errored).toBe(false);
      expect(maxPercent.errored).toBe(false);
      expect(minRem.errored).toBe(false);
    });

    test("variables and interpolation are ignored", async () => {
      const varResult = await runPlugin(css`
        .a { inline-size: max($min-size, 100%); }
      `);
      const interpolationResult = await runPlugin(css`
        .b { inline-size: max(#{24px}, #{100%}); }
      `);
      expect(varResult.errored).toBe(false);
      expect(interpolationResult.errored).toBe(false);
    });

    test("standalone calc with mixed units is fine", async () => {
      const result = await runPlugin(css`
        .a { inline-size: calc(100% - 24px); }
      `);
      expect(result.errored).toBe(false);
    });
  });

  describe("rejects mixed units", () => {
    test("max/min/clamp with simple mixed units", async () => {
      const maxResult = await runPlugin(css`
        .a { inline-size: max(24px, 100%); }
      `);
      const minResult = await runPlugin(css`
        .b { block-size: min(3rem, 100%); }
      `);
      const clampResult = await runPlugin(css`
        .c { inline-size: clamp(24px, 50%, 800px); }
      `);
      expect(maxResult.errored).toBe(true);
      expect(maxResult.results[0].warnings[0].text).toContain("Avoid mixing units in CSS math functions");
      expect(minResult.errored).toBe(true);
      expect(clampResult.errored).toBe(true);
    });

    test("max/min/clamp with nested calc containing mixed units", async () => {
      const maxResult = await runPlugin(css`
        .a { max-inline-size: max(0px, calc((100% - 12rem) / 2)); }
      `);
      const minResult = await runPlugin(css`
        .b { max-inline-size: min(50px, calc(100% - 2rem)); }
      `);
      const clampResult = await runPlugin(css`
        .c { inline-size: clamp(0px, calc(100% - 4rem), 600px); }
      `);
      expect(maxResult.errored).toBe(true);
      expect(minResult.errored).toBe(true);
      expect(clampResult.errored).toBe(true);
    });
  });
});
