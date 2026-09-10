// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module";

import { describe, expect, test, vi } from "vitest";

const resolver = createRequire(import.meta.url)("../emitted-extension-resolver.cjs");

// Stands in for Jest's own resolver: resolves the paths it is given and throws for anything else.
function defaultResolverFor(resolvable) {
  return vi.fn(request => {
    if (!resolvable.includes(request)) {
      throw new Error(`Cannot find module '${request}'`);
    }
    return `/abs/${request}`;
  });
}

function resolve(request, resolvable) {
  const defaultResolver = defaultResolverFor(resolvable);
  return { result: resolver(request, { defaultResolver }), calls: defaultResolver.mock.calls.map(([r]) => r) };
}

describe("emitted-extension-resolver", () => {
  test("falls back to the source file when the emitted name does not resolve", () => {
    expect(resolve("./leaf.js", ["./leaf.ts"])).toEqual({
      result: "/abs/./leaf.ts",
      calls: ["./leaf.js", "./leaf.ts"],
    });
  });

  test("handles a directory index and the other emitted extensions", () => {
    expect(resolve("./sub/index.js", ["./sub/index.ts"]).result).toBe("/abs/./sub/index.ts");
    expect(resolve("../modern.mjs", ["../modern.mts"]).result).toBe("/abs/../modern.mts");
    expect(resolve("../legacy.cjs", ["../legacy.cts"]).result).toBe("/abs/../legacy.cts");
  });

  test("tries every source extension that emits the requested one", () => {
    expect(resolve("./widget.js", ["./widget.tsx"]).calls).toEqual(["./widget.js", "./widget.ts", "./widget.tsx"]);
    expect(resolve("./classic.js", ["./classic.jsx"]).result).toBe("/abs/./classic.jsx");
  });

  test("only considers sources that emit the requested extension", () => {
    // `.mjs` comes from `.mts` alone. Stripping the suffix instead would let moduleFileExtensions reach
    // `foo.ts`, which emits `foo.js`, so the test would execute a different module from the shipped one.
    const { result, calls } = resolve("./foo.mjs", ["./foo.ts", "./foo.mts"]);
    expect(result).toBe("/abs/./foo.mts");
    expect(calls).toEqual(["./foo.mjs", "./foo.mts"]);
  });

  test("never falls back to a directory index, a manifest or a declaration", () => {
    // Nothing in the published package sits at these paths, so resolving them would hide a broken
    // specifier rather than surface it.
    for (const [request, decoy] of [
      ["./dirmod.js", "./dirmod"],
      ["./data.js", "./data.json"],
      ["./typesonly.js", "./typesonly.d.ts"],
    ]) {
      const defaultResolver = defaultResolverFor([decoy]);
      expect(() => resolver(request, { defaultResolver })).toThrow(`Cannot find module '${request}'`);
      expect(defaultResolver.mock.calls.map(([r]) => r)).not.toContain(decoy);
    }
  });

  test("prefers a real emitted file over any source sibling", () => {
    // The case a moduleNameMapper gets wrong: `styles.css.js` exists, and stripping would find
    // `styles.css` instead.
    const { result, calls } = resolve("./styles.css.js", ["./styles.css.js", "./styles.css"]);
    expect(result).toBe("/abs/./styles.css.js");
    expect(calls).toEqual(["./styles.css.js"]);
  });

  test("leaves specifiers it cannot help alone", () => {
    // A bare specifier, and a relative one with no emitted extension: one attempt, then the error.
    for (const request of ["@cloudscape-design/components/button.js", "./leaf", "./styles.scoped.css"]) {
      const defaultResolver = defaultResolverFor([]);
      expect(() => resolver(request, { defaultResolver })).toThrow(`Cannot find module '${request}'`);
      expect(defaultResolver.mock.calls).toHaveLength(1);
    }
  });

  test("reports the specifier as written when no candidate resolves", () => {
    const defaultResolver = defaultResolverFor([]);
    expect(() => resolver("./missing.js", { defaultResolver })).toThrow("Cannot find module './missing.js'");
    expect(defaultResolver.mock.calls.map(([r]) => r)).toEqual([
      "./missing.js",
      "./missing.ts",
      "./missing.tsx",
      "./missing.jsx",
    ]);
  });
});
