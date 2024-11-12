// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import stylelint from "stylelint";

import { configBasedir } from "./common.js";

// This is for prettier format: https://github.com/prettier/prettier/issues/2330
// String.raw is an identity function in this context
const css = String.raw;

function runPlugin(code) {
  return stylelint.lint({
    code,
    configBasedir,
    config: {
      plugins: ["../z-index-value-constraint.js"],
      rules: {
        "@cloudscape-design/z-index-value-constraint": [true],
      },
    },
  });
}

describe("z-index value contstraint rule", () => {
  test("allows non integer z-index values", async () => {
    const result = await runPlugin(css`
      .styled-circle-motion {
        @include styles.with-motion {
          z-index: some.$variable;
        }
      }
    `);

    expect(result.errored).toBe(false);
  });

  test.each([0, 1000])("allows non negative z-index values: %s", async zIndexValue => {
    const result = await runPlugin(css`
      .styled-circle-motion {
        @include styles.with-motion {
          z-index: ${zIndexValue};
        }
      }
    `);

    expect(result.errored).toBe(false);
  });

  test("does not allow negative z-index values", async () => {
    const result = await runPlugin(css`
      .styled-circle-motion {
        @include styles.with-motion {
          z-index: -10;
        }
      }
    `);

    expect(result.errored).toBe(true);
    expect(result.results[0].warnings[0].text).toBe(`Avoid using negative z-index values: -10.
    This can cause the element to disappear behind its container's background color. (@cloudscape-design/z-index-value-constraint)`);
  });
});
