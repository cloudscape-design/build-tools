// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * A Jest `resolver` that lets a specifier naming an emitted file resolve onto its TypeScript source.
 * `require-emitted-extensions` rewrites `./leaf` to `./leaf.js`, which Jest would otherwise resolve
 * against the `leaf.ts` on disk and fail.
 *
 * The literal request is tried first, and the fallback names candidate sources explicitly. A
 * `moduleNameMapper` is not a substitute: it rewrites unconditionally, so it also strips the extension
 * from specifiers naming a real emitted file such as `styles.css.js`.
 *
 * Usage, in a Jest config:
 *
 *     resolver: require.resolve('@cloudscape-design/build-tools/lib/jest/emitted-extension-resolver.cjs'),
 *
 * CommonJS because Jest loads the resolver synchronously.
 */

const EMITTED_EXTENSION = /\.(?:m|c)?js$/;

// The sources that emit each of those, in the order the lint rule probes them. `.tsx` and `.jsx` collapse
// onto `.js` because every Cloudscape repository compiles with `jsx: "react"`.
const SOURCE_EXTENSIONS = {
  ".js": [".ts", ".tsx", ".jsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

module.exports = function resolveEmittedExtension(request, options) {
  try {
    return options.defaultResolver(request, options);
  } catch (error) {
    const emitted = EMITTED_EXTENSION.exec(request);
    // Only a relative specifier can have a TypeScript source sibling. Rewriting a bare one would resolve
    // a dependency to the wrong file.
    if (!request.startsWith(".") || !emitted) {
      throw error;
    }
    const stem = request.slice(0, emitted.index);
    for (const extension of SOURCE_EXTENSIONS[emitted[0]]) {
      try {
        return options.defaultResolver(stem + extension, options);
      } catch {
        // Not this source extension; try the next.
      }
    }
    // The original failure, so the message names the specifier as written rather than a candidate.
    throw error;
  }
};
