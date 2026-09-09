// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { Linter, RuleTester } from "eslint";
import { afterAll, describe, expect, test } from "vitest";

import plugin from "../index.js";
import rule from "../require-emitted-extensions.js";

const require = createRequire(import.meta.url);

// The rule only ever stats these paths, so the tree is built at runtime and the contents are irrelevant.
// That also keeps hidden entries and symlinks out of the checkout, which a Windows clone cannot
// materialize without developer mode.
const FILES = [
  "leaf.ts",
  "widget.tsx", // .tsx emits .js, because every Cloudscape repository compiles with jsx: "react"
  "helper.js",
  "index.ts",
  "modern.mts",
  "legacy.mjs",
  "legacy-commonjs.cjs",
  "environment.d.ts", // a declaration whose implementation only exists after a build
  "modern-environment.d.mts", // the same, in the module flavour: the implementation is .mjs
  "dual.d.ts", // a declaration beside an implementation, which decides the extension
  "dual.cjs",
  "flavour.ts", // earlier in the probe order than flavour.mts, which is a different module
  "flavour.mts",
  "ambiguous.ts", // paired with ambiguous/index.ts, so "./ambiguous" is unresolvable
  "ambiguous/index.ts",
  "collide.ts", // paired with collide/index.ts: "." inside collide/ must not find this sibling
  "collide/index.ts",
  "collide/deep/other.ts",
  "sub/index.ts",
  "sub/nested/index.tsx",
  "runtime/index.js",
  "dotted.dir/index.ts", // a dotted directory still resolves to its index
  "indexless/other.ts", // a directory with no index cannot be imported under Node ESM
  "indexless/deep/other.ts",
  "format.helper.ts", // a dotted stem that is a real source, so "./format.helper" is in scope
  "looks-emitted.js.ts", // "./looks-emitted.js" must be left alone, not doubled to ".js.js"
  "needs$escaping.ts", // outside PLAIN_SPECIFIER, so a fix naming it goes through JSON.stringify
  "shadowed", // shadowed by shadowed.ts; tsc does not copy it, so "./shadowed" must name shadowed.js
  "shadowed.ts",
  "vendor-blob", // extensionless with no source sibling: no emitted extension to append
  "notes.md",
  "data.json",
  ".foo.ts", // dot-prefixed: a bare specifier to Node, so the rule declines to fix it
  ".dir/index.ts",
];

// name -> target. A symlink to a file, to a directory, and one that dangles.
const LINKS = { "linked.ts": "leaf.ts", "linked-dir": "sub", "dangling.ts": "nowhere.ts" };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "require-emitted-extensions-"));
for (const name of FILES) {
  const absolute = path.join(root, name);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, "// fixture\n");
}
let symlinked = false;
try {
  for (const [name, target] of Object.entries(LINKS)) {
    fs.symlinkSync(path.join(root, target), path.join(root, name));
  }
  symlinked = true;
} catch {
  // Symlinks are unsupported here, so the test that needs them skips.
}

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

// Only the importer's directory is read, so none of these files has to exist.
const filename = path.join(root, "importer.ts");
const nested = path.join(root, "sub", "importer.ts");
const collide = path.join(root, "collide", "importer.ts");
const collideDeep = path.join(root, "collide", "deep", "importer.ts");
const indexlessDeep = path.join(root, "indexless", "deep", "importer.ts");

const parserPath = require.resolve("@typescript-eslint/parser");
// eslintrc configs take a path, flat configs take the module itself.
const parserModule = require(parserPath);
const flatParser = parserModule.parseForESLint ? parserModule : parserModule.default;

const runRule = testCase =>
  new RuleTester({
    parser: parserPath,
    parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  }).run("require-emitted-extensions", rule, { valid: [], invalid: [], ...testCase });

// Most cases vary only in the specifier, so they are written as one entry each and wrapped in an import.
// The statement forms that do matter are covered in "checks every specifier position".
const imp = specifier => `import x from ${JSON.stringify(specifier)};`;
const accepts = (specifiers, extra) => specifiers.map(specifier => ({ code: imp(specifier), filename, ...extra }));
// `emitted` is null where the rule must report without offering a fix.
const reports = (messageId, cases, extra) =>
  cases.map(([specifier, emitted]) => ({
    code: imp(specifier),
    filename,
    output: emitted ? imp(emitted) : null,
    errors: [{ messageId }],
    ...extra,
  }));
// The same, where the statement form itself is the point, so both sides are given in full.
const rewrites = (cases, messageId = "missing") =>
  cases.map(([code, output]) => ({ code, filename, output, errors: [{ messageId }] }));

describe("require-emitted-extensions", () => {
  test("accepts specifiers that already name the emitted file", () =>
    runRule({
      valid: [
        ...accepts(["./leaf.js", "./helper.js", "./legacy.mjs", "./sub/index.js", "./dual.cjs"]),
        ...accepts(["../index.js"], { filename: nested }),
      ],
    }));

  test("ignores specifiers outside its scope", () =>
    runRule({
      valid: [
        ...accepts([
          "react",
          "@cloudscape-design/component-toolkit",
          // A dotted last segment with no TypeScript source behind it, on disk or not. The dotted stems
          // that do have a source are in "fixes a dotted stem backed by a source".
          "./styles.scss",
          "./data.json",
          "./notes.md",
          "./missing.md",
          "./styles.css.js",
          "./styles.selectors.js",
          // looks-emitted.js.ts is on disk, so probing extensioned specifiers would append again.
          "./looks-emitted.js",
          "./vendor-blob",
          // Loader prefixes, query strings, and characters Node's URL-based resolver reinterprets.
          "./leaf?raw",
          "./leaf!inline",
          "./leaf#fragment",
          "./a%20b",
          // Node reads a dot-prefixed specifier as a bare one, so a fix would change nothing.
          ".foo",
          ".foo.ts",
          ".dir",
          "...",
        ]),
        // No CallExpression visitor is registered, so these are only reachable if one is added.
        { code: 'const { leaf } = require("./leaf");', filename },
        { code: 'jest.mock("./leaf");', filename },
        // An interpolated template has no static value; see "fixes a template literal with no
        // substitutions" for the form that does.
        { code: "import(`./${name}`);", filename },
        { code: "import(`${dir}/leaf`);", filename },
        { code: "import(`./leaf.js`);", filename },
        // Statically known but not a string: the rule must not call string methods on it.
        { code: "import(1);", filename },
        { code: "import(null);", filename },
        { code: "export const x = 1;", filename },
        { code: "export {};", filename },
        // Linting stdin gives a filename nothing resolves against, so the rule stands down.
        { code: 'import { leaf } from "./leaf";' },
      ],
    }));

  test("appends the extension the build emits for the resolved file", () =>
    runRule({
      invalid: [
        {
          code: 'import { leaf } from "./leaf";',
          filename,
          output: 'import { leaf } from "./leaf.js";',
          errors: [{ messageId: "missing", data: { specifier: "./leaf", emitted: "./leaf.js" } }],
        },
        {
          // The original quote style is preserved so the fix does not fight Prettier.
          code: "import { leaf } from './leaf';",
          filename,
          output: "import { leaf } from './leaf.js';",
          errors: [{ messageId: "missing" }],
        },
        {
          code: 'import type { Leaf } from "./leaf";',
          filename,
          output: 'import type { Leaf } from "./leaf.js";',
          errors: [{ messageId: "missing" }],
        },
        ...reports("missing", [
          ["./widget", "./widget.js"],
          ["./helper", "./helper.js"],
          // .mjs, .cjs and .mts are emitted under their own module flavour, not as .js.
          ["./legacy", "./legacy.mjs"],
          ["./legacy-commonjs", "./legacy-commonjs.cjs"],
          ["./modern", "./modern.mjs"],
          // A declaration is the only on-disk evidence for a build-generated module. Omitting .d.mts from
          // the probe order reported that modern-environment does not resolve.
          ["./environment", "./environment.js"],
          ["./modern-environment", "./modern-environment.mjs"],
          // The implementation decides: probing dual.d.ts first would emit an unloadable "./dual.js".
          ["./dual", "./dual.cjs"],
          // Reported even though it exists as written, because node10 resolution never considers an
          // extensionless file and tsc does not copy `shadowed` into outDir, so the emitted "./shadowed"
          // is an ERR_MODULE_NOT_FOUND. The no-sibling case is "./vendor-blob" above.
          ["./shadowed", "./shadowed.js"],
        ]),
        ...reports("missing", [["../leaf", "../leaf.js"]], { filename: nested }),
      ],
    }));

  test("expands directory specifiers to the index file", () =>
    runRule({
      invalid: [
        {
          code: 'import { sub } from "./sub";',
          filename,
          output: 'import { sub } from "./sub/index.js";',
          errors: [{ messageId: "missing", data: { specifier: "./sub", emitted: "./sub/index.js" } }],
        },
        ...reports("missing", [
          ["./sub/", "./sub/index.js"],
          ["./sub/nested", "./sub/nested/index.js"],
          ["./runtime", "./runtime/index.js"],
          [".", "./index.js"],
          ["./index", "./index.js"],
        ]),
        ...reports(
          "missing",
          [
            ["..", "../index.js"],
            ["../", "../index.js"],
          ],
          { filename: nested },
        ),
        // "." from inside collide/, where a sibling collide.ts also exists. Normalizing with
        // path.resolve before probing would find collide.ts and call this ambiguous.
        ...reports("missing", [[".", "./index.js"]], { filename: collide }),
        ...reports("missing", [["..", "../index.js"]], { filename: collideDeep }),
      ],
    }));

  // Verified against Node 22: an ESM `import "./missing/../leaf.js"` loads leaf.js with no `missing`
  // directory anywhere, because the specifier is resolved as a URL first.
  test("collapses dot segments the way Node's URL resolution does", () =>
    runRule({
      // Only the extension is missing, so the shape of the path is left as written.
      valid: accepts(["./missing/../leaf.js"]),
      invalid: reports("missing", [
        ["./missing/../leaf", "./missing/../leaf.js"],
        ["./sub/../leaf", "./sub/../leaf.js"],
        // A trailing ".." after a nonexistent segment lands on the importer's own directory.
        ["./missing/..", "./missing/../index.js"],
        // "Sub" is removed before any lookup, so its case is never checked. "./Sub/nested" below, where
        // the segment survives, still has to fail.
        ["./Sub/../leaf", "./Sub/../leaf.js"],
      ]),
    }));

  test("replaces a TypeScript source extension with the emitted one", () =>
    runRule({
      invalid: [
        {
          code: 'import { leaf } from "./leaf.ts";',
          filename,
          output: 'import { leaf } from "./leaf.js";',
          errors: [{ messageId: "tsExtension", data: { specifier: "./leaf.ts", emitted: "./leaf.js" } }],
        },
        ...reports("tsExtension", [
          ["./widget.tsx", "./widget.js"],
          ["./environment.d.ts", "./environment.js"],
          ["./modern.mts", "./modern.mjs"],
          // A directory, so the fix is the index file rather than a sibling "./sub.js" that does not exist.
          ["./sub.ts", "./sub/index.js"],
          // Has to agree with the extensionless "./dual" case above.
          ["./dual.d.ts", "./dual.cjs"],
          // flavour.ts and flavour.mts are different modules, and flavour.ts comes first in the probe
          // order, so resolving the stem alone would silently load the other one.
          ["./flavour.mts", "./flavour.mjs"],
          // The named source does not exist, so the preference is not a shortcut past the disk.
          ["./flavour.cts", "./flavour.js"],
          // TS_SPECIFIER matches ".d.mts", so the rule has to resolve it rather than claim a file it can
          // see does not exist.
          ["./modern-environment.d.mts", "./modern-environment.mjs"],
        ]),
        // Still reported with nothing on disk, but not fixed: "./generated.js" would be a guess, and once
        // written the rule would never look at it again.
        ...reports("tsExtensionUnresolved", [["./generated.ts", null]]),
      ],
    }));

  test("checks every specifier position", () =>
    runRule({
      invalid: [
        ...rewrites([
          ['import "./sub";', 'import "./sub/index.js";'],
          ['export * from "./leaf";', 'export * from "./leaf.js";'],
          ['export * as leaf from "./leaf";', 'export * as leaf from "./leaf.js";'],
          ['export { leaf } from "./leaf";', 'export { leaf } from "./leaf.js";'],
          ['export type { Leaf } from "./leaf";', 'export type { Leaf } from "./leaf.js";'],
          ['const leaf = import("./leaf");', 'const leaf = import("./leaf.js");'],
        ]),
        {
          code: 'import { leaf } from "./leaf";\nimport { sub } from "./sub";',
          filename,
          output: 'import { leaf } from "./leaf.js";\nimport { sub } from "./sub/index.js";',
          errors: [{ messageId: "missing" }, { messageId: "missing" }],
        },
      ],
    }));

  test("reports without a fix when the target cannot be proven", () =>
    runRule({
      invalid: [
        {
          // Both ./ambiguous.ts and ./ambiguous/index.ts exist, so guessing would replace a build error
          // with a silent behavior change.
          code: 'import { ambiguous } from "./ambiguous";',
          filename,
          output: null,
          errors: [{ messageId: "ambiguous", data: { specifier: "./ambiguous" } }],
        },
        {
          code: 'import { nope } from "./nope";',
          filename,
          output: null,
          errors: [{ messageId: "unresolvable", data: { specifier: "./nope" } }],
        },
        ...reports("unresolvable", [
          // Only leaf.ts exists. A case-insensitive check would certify these and break on Linux CI, for
          // the final segment and for a directory segment alike.
          ["./Leaf", null],
          ["./Sub", null],
          ["./Sub/nested", null],
          ["./indexless", null],
          ["./indexless/", null],
          // A dotfile: the leading dot names the file, it is not an extension.
          ["./.nope", null],
        ]),
        // ".." from a directory whose parent has no index. Reading ".." as an extension would accept this.
        ...reports("unresolvable", [["..", null]], { filename: indexlessDeep }),
      ],
    }));

  // `$` is outside PLAIN_SPECIFIER, so the fix is built with JSON.stringify rather than concatenated into
  // the quotes already there, which is why the single quotes become double.
  test("escapes a fix that cannot be dropped into a quoted string as-is", () =>
    runRule({
      invalid: [
        ...rewrites([["import x from './needs$escaping';", 'import x from "./needs$escaping.js";']]),
        ...rewrites([["import x from './needs$escaping.ts';", 'import x from "./needs$escaping.js";']], "tsExtension"),
        // Never fixed anyway, since nothing on disk backs it. Kept to pin that the rule reports rather
        // than emitting unparseable code.
        ...rewrites([['import x from "./say\\"hi.ts";', null]], "tsExtensionUnresolved"),
      ],
    }));

  // tsc emits a template verbatim, so it fails under Node exactly as the quoted form does. The fix
  // converts it to a quoted string, since a cooked specifier can hold a backtick or a dollar-brace.
  test("fixes a template literal with no substitutions", () =>
    runRule({
      invalid: [
        ...rewrites([
          ["import(`./leaf`);", "import('./leaf.js');"],
          ["import(`./sub`);", "import('./sub/index.js');"],
        ]),
        ...rewrites([["import(`./leaf.ts`);", "import('./leaf.js');"]], "tsExtension"),
        ...rewrites([["import(`./nope`);", null]], "unresolvable"),
      ],
    }));

  // The disk, not the dot, decides which group a specifier lands in. The valid side is in "ignores
  // specifiers outside its scope".
  test("fixes a dotted stem backed by a source", () =>
    runRule({
      invalid: reports("missing", [
        ["./format.helper", "./format.helper.js"],
        ["./dotted.dir", "./dotted.dir/index.js"],
      ]),
    }));

  test.skipIf(!symlinked)("follows symlinks to a file and a directory, and refuses a dangling one", () =>
    runRule({
      invalid: reports("missing", [
        ["./linked", "./linked.js"],
        // A symlink to a directory resolves to its index, rather than being mistaken for a file.
        ["./linked-dir", "./linked-dir/index.js"],
      ]).concat(reports("unresolvable", [["./dangling", null]])),
    }),
  );

  test("honors its options", () =>
    runRule({
      valid: [
        // Any pattern in the list may match.
        ...accepts(["../../lib/components/token"], { options: [{ ignore: ["/never-matches/", "/lib/"] }] }),
        ...accepts(["./nope"], { options: [{ allowUnresolved: true }] }),
      ],
      invalid: [
        ...reports("missing", [["./leaf", "./leaf.js"]], { options: [{ ignore: ["/lib/"] }] }),
        // allowUnresolved silences only the unresolvable case, never a provable fix, a genuine ambiguity,
        // or a TypeScript extension.
        ...reports("missing", [["./leaf", "./leaf.js"]], { options: [{ allowUnresolved: true }] }),
        ...reports("ambiguous", [["./ambiguous", null]], { options: [{ allowUnresolved: true }] }),
        ...reports("tsExtensionUnresolved", [["./generated.ts", null]], { options: [{ allowUnresolved: true }] }),
      ],
    }));
});

// The consuming repositories load these rules as a flat-config plugin on ESLint 9, while this package is
// pinned to ESLint 8 and its RuleTester is eslintrc-only. This covers the flat-config path and the plugin
// barrel, so a rule that is unreachable or misnamed there fails here.
describe("require-emitted-extensions through the flat-config plugin barrel", () => {
  // `cwd` has to be the tree: flat config matches `files` against the basePath-relative path, so a
  // filename outside the cwd matches nothing and the rule silently never runs.
  const lint = (code, options = {}) =>
    new Linter({ configType: "flat", cwd: root }).verifyAndFix(
      code,
      {
        // Flat config only applies to .js by default, and the importer is TypeScript.
        files: ["**/*.{ts,tsx}"],
        plugins: { "@cloudscape-design/build-tools": plugin },
        languageOptions: {
          parser: flatParser,
          parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
        },
        rules: { "@cloudscape-design/build-tools/require-emitted-extensions": ["error", options] },
      },
      filename,
    );

  test("is idempotent: fixing its own output is a no-op", () => {
    const source = 'import { leaf } from "./leaf";\nimport { sub } from "./sub";\n';
    const once = lint(source).output;
    expect(once).toBe('import { leaf } from "./leaf.js";\nimport { sub } from "./sub/index.js";\n');
    const twice = lint(once);
    expect(twice.output).toBe(once);
    expect(twice.messages).toEqual([]);
  });

  test("leaves an already-extensioned specifier alone rather than doubling it", () => {
    // ./dual.cjs is on disk, so a rule that re-probed extensioned specifiers could emit "./dual.cjs.js".
    const code = 'import { dual } from "./dual.cjs";\nimport { leaf } from "./leaf.js";\n';
    expect(lint(code).output).toBe(code);
  });

  test("rejects an unparseable ignore pattern with a message naming the option", () => {
    expect(() => lint('import { leaf } from "./leaf";\n', { ignore: ["([unclosed"] })).toThrow(
      /Invalid "ignore" pattern/,
    );
  });

  test("stands down on flat config's placeholder filename for stdin", () => {
    const messages = new Linter({ configType: "flat", cwd: root }).verify(
      'import { leaf } from "./leaf";\n',
      {
        plugins: { "@cloudscape-design/build-tools": plugin },
        languageOptions: { parserOptions: { ecmaVersion: 2022, sourceType: "module" } },
        rules: { "@cloudscape-design/build-tools/require-emitted-extensions": "error" },
      },
      // ESLint 9 names stdin "<cwd>/__placeholder__.js" when there is no --stdin-filename. Only the
      // basename matters to the guard.
      path.join(root, "__placeholder__.js"),
    );
    expect(messages).toEqual([]);
  });
});
