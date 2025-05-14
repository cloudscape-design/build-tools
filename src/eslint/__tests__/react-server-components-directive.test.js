// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, test } from "vitest";
import { RuleTester } from "eslint";
import rscDirective from "../react-server-components-directive.js";

const testRule = testCase => {
  new RuleTester({ parserOptions: { ecmaVersion: 2018, sourceType: "module" } }).run(
    "react-server-components-directive",
    rscDirective,
    { valid: [], invalid: [], ...testCase },
  );
};

describe("valid", () => {
  test("directive is not needed on internal files", () => {
    testRule({
      valid: [
        {
          code: "export default function InternalButton() {}",
          filename: "./src/button/internal.tsx",
        },
      ],
    });
  });

  test("directive works on index.tsx files", () =>
    testRule({
      valid: [
        {
          code: `
            "use client";
            export default function Button() {}
          `,
          filename: "./src/button/index.tsx",
        },
      ],
    }));

  test("directive works on index.ts files", () =>
    testRule({
      valid: [
        {
          code: `
            "use client";
            export default function Tooltip() {}
          `,
          filename: "./src/i18n/index.ts",
        },
      ],
    }));

  test("directive can be set after a license comment", () =>
    testRule({
      valid: [
        {
          code: `
            // Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
            // SPDX-License-Identifier: Apache-2.0
            "use client";
            export default function Button() {}
          `,
          filename: "./src/button/index.tsx",
        },
      ],
    }));

  test("entryFilesPattern can be changed", () =>
    testRule({
      valid: [
        {
          code: `
            "use client";
            export default function Tooltip() {}
          `,
          filename: "./src/internal/tooltip-do-not-use/index.ts",
          options: [
            {
              entryFilesPattern: "./src/internal/tooltip-do-not-use/index.ts",
            },
          ],
        },
      ],
    }));
});

describe("invalid", () => {
  test("unexpected directive in an internal file", () =>
    testRule({
      invalid: [
        {
          code: `
            "use client";
            export default function InternalButton() {}
          `,
          output: `
            
            export default function InternalButton() {}
          `,
          filename: "./src/button/internal.tsx",
          errors: [{ message: 'Unexpected "use client" directive inside an internal file.' }],
        },
      ],
    }));

  test("no directive on a file with a comment", () =>
    testRule({
      invalid: [
        {
          code: `
            // Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
            // SPDX-License-Identifier: Apache-2.0
            export default function Button() {}
          `,
          output: `
            // Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
            // SPDX-License-Identifier: Apache-2.0
            "use client";
export default function Button() {}
          `,
          filename: "./src/button/index.tsx",
          errors: [{ message: 'Missing "use client" directive on the entry file.' }],
        },
      ],
    }));

  test("no directive on a file without a comment", () =>
    testRule({
      invalid: [
        {
          code: "export default function Button() {}",
          output: `"use client";
export default function Button() {}`,
          filename: "./src/button/index.tsx",
          errors: [{ message: 'Missing "use client" directive on the entry file.' }],
        },
      ],
    }));
});
