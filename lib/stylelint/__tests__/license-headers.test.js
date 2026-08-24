// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import stylelint from "stylelint";

import { configBasedir } from "./common.js";

function runPlugin(code, header, { fix = false, commentType, scss = false } = {}) {
  return stylelint.lint({
    code,
    configBasedir,
    fix,
    // Line comments are Sass syntax, so they need the Sass parser.
    customSyntax: scss ? "postcss-scss" : undefined,
    config: {
      plugins: ["../license-headers.js"],
      rules: {
        "@cloudscape-design/license-headers": [true, { header, ...(commentType ? { commentType } : {}) }],
      },
    },
  });
}

const messageOf = ({ results }) => results[0].warnings[0]?.text;

describe("Typical usage", () => {
  test("finds single line comments", async () => {
    const { errored } = await runPlugin(
      `/* My copyright */
    .some-css {}
    `,
      "My copyright",
    );
    expect(errored).toBe(false);
  });

  test("does not find single line comments", async () => {
    const { errored } = await runPlugin(
      `/* Different copyright */
  .some-css {}
  `,
      "My copyright",
    );
    expect(errored).toBe(true);
  });

  test("finds multi-line comments", async () => {
    const { errored } = await runPlugin(
      `/* My copyright
 Copyright 2022 */
.some-css {}
`,
      "My copyright\n Copyright 2022",
    );
    expect(errored).toBe(false);
  });

  test("ignores non-root comments", async () => {
    const { errored } = await runPlugin(
      `.some-css {}
/* My copyright */
  `,
      "My copyright",
    );
    expect(errored).toBe(true);
  });
});

describe("Autofixing", () => {
  test("fixes simple file without header", async () => {
    const { errored, output } = await runPlugin(`.some-css {}`, "My copyright", { fix: true });
    expect(errored).toBe(false);
    expect(output).toBe(
      `/*My copyright*/
.some-css {}`,
    );
  });

  test("fixes file with existing header", async () => {
    const { errored, output } = await runPlugin(
      `/* some other header */
.some-css {}`,
      "My copyright",
      { fix: true },
    );
    expect(errored).toBe(false);
    expect(output).toBe(
      `/*My copyright*/
/* some other header */
.some-css {}`,
    );
  });

  test("does not add duplicate headers", async () => {
    const input = `/*My copyright*/
.some-css {}`;

    const { errored, output } = await runPlugin(input, "My copyright", { fix: true });
    expect(errored).toBe(false);
    expect(output).toBe(input);
  });
});

describe('commentType: "line"', () => {
  const header = "\n My copyright\n Copyright 2022\n";
  const lineHeader = `// My copyright
// Copyright 2022`;
  const run = (code, options) => runPlugin(code, header, { commentType: "line", scss: true, ...options });

  test("finds a line comment header", async () => {
    const { errored } = await run(`${lineHeader}\n\n.some-css {}`);
    expect(errored).toBe(false);
  });

  test("finds a line comment header followed by unrelated line comments", async () => {
    const { errored } = await run(`${lineHeader}\n// See the design doc.\n\n.some-css {}`);
    expect(errored).toBe(false);
  });

  test("reports a missing header", async () => {
    const result = await run(`.some-css {}`);
    expect(result.errored).toBe(true);
    expect(messageOf(result)).toContain("Missing license header");
  });

  test("reports a partial header", async () => {
    const result = await run(`// My copyright\n\n.some-css {}`);
    expect(result.errored).toBe(true);
    expect(messageOf(result)).toContain("Missing license header");
  });

  test("reports a block comment header", async () => {
    const result = await run(`/*${header}*/\n\n.some-css {}`);
    expect(result.errored).toBe(true);
    expect(messageOf(result)).toContain("License header must use line comments (//)");
  });

  test("reports a header that is not at the top of the file", async () => {
    const result = await run(`/* some other header */\n${lineHeader}\n\n.some-css {}`);
    expect(result.errored).toBe(true);
    expect(messageOf(result)).toContain("Missing license header");
  });

  test("fixes a file without a header", async () => {
    const { errored, output } = await run(`.some-css {}`, { fix: true });
    expect(errored).toBe(false);
    expect(output).toBe(`${lineHeader}\n\n.some-css {}`);
  });

  test("fixes a file with a block comment header", async () => {
    const { errored, output } = await run(`/*${header}*/\n\n.some-css {}`, { fix: true });
    expect(errored).toBe(false);
    expect(output).toBe(`${lineHeader}\n\n.some-css {}`);
  });

  test("leaves an unrelated block comment in place", async () => {
    const { errored, output } = await run(`/* some other header */\n.some-css {}`, { fix: true });
    expect(errored).toBe(false);
    expect(output).toBe(`${lineHeader}\n\n/* some other header */\n.some-css {}`);
  });

  test("is idempotent", async () => {
    const once = await run(`.some-css {}`, { fix: true });
    const twice = await run(once.output, { fix: true });
    expect(twice.output).toBe(once.output);
  });
});

describe('commentType: "block"', () => {
  const header = "\n My copyright\n Copyright 2022\n";

  test("reports a line comment header", async () => {
    const result = await runPlugin(`// My copyright\n// Copyright 2022\n\n.some-css {}`, header, {
      commentType: "block",
      scss: true,
    });
    expect(result.errored).toBe(true);
    expect(messageOf(result)).toContain("License header must use a block comment (/* */)");
  });

  test("replaces a line comment header on fix", async () => {
    const { errored, output } = await runPlugin(`// My copyright\n// Copyright 2022\n\n.some-css {}`, header, {
      commentType: "block",
      fix: true,
      scss: true,
    });
    expect(errored).toBe(false);
    expect(output).toBe(`/*${header}*/\n.some-css {}`);
  });
});

describe("Invalid options", () => {
  test("rejects an unknown commentType", async () => {
    await expect(runPlugin(`.some-css {}`, "My copyright", { commentType: "inline" })).rejects.toThrow(
      'rule option "commentType" must be one of: block, line.',
    );
  });
});
