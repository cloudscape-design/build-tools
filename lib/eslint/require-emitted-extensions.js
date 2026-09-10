// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";

/**
 * Requires every relative import specifier to name the file the build emits, so the published package
 * resolves under Node's ESM rules.
 *
 * Node's ESM resolver neither probes extensions nor falls back to a directory index, so `./interfaces`
 * and `./sub` are unloadable in published output even though TypeScript accepts them and bundlers
 * resolve them. TypeScript passes relative specifiers through verbatim, so the fix belongs in the
 * source: `./interfaces.js`, `./sub/index.js`.
 *
 * The specifier names the emitted file, not the file on disk: `./leaf` beside `leaf.ts` becomes
 * `./leaf.js`. Fixes come only from evidence on disk, so a specifier that resolves to nothing or is
 * ambiguous is reported without one.
 *
 * Out of scope: bare specifiers, including `.foo`, which Node reads as a package name; `require()` and
 * `jest.mock()`, whose resolver does probe extensions; specifiers already carrying a non-TypeScript
 * extension, many of which name build-generated siblings such as `./styles.css.js`; interpolated
 * template literals; and specifiers containing `!?#%`, which a bundler or Node's URL parsing
 * reinterprets.
 *
 * Adoption takes two things the rule cannot enforce: `ignore: ["/lib/"]` for the package's own build
 * output, and `lib/jest/emitted-extension-resolver.cjs` as the Jest `resolver`, since Jest otherwise
 * resolves a rewritten `./x.js` against the `x.ts` on disk.
 */

// Extensions a relative specifier may resolve to, mapped to the extension the build emits. Declarations
// come last, so an implementation sibling wins: a `.d.ts` next to an `.mjs` emits `./x.mjs`.
const EMITTED_EXTENSION = {
  ".ts": ".js",
  ".tsx": ".js",
  ".mts": ".mjs",
  ".cts": ".cjs",
  ".js": ".js",
  ".jsx": ".js",
  ".mjs": ".mjs",
  ".cjs": ".cjs",
  ".d.ts": ".js",
  ".d.mts": ".mjs",
  ".d.cts": ".cjs",
};
const PROBE_ORDER = Object.keys(EMITTED_EXTENSION);

// Specifiers naming a TypeScript source directly. TypeScript accepts these only under
// `allowImportingTsExtensions`, whose companion flags either emit no JavaScript or leave the `.d.ts`
// output unrewritten, so none of them make a `.ts` specifier correct here.
const TS_SPECIFIER = /\.(?:d\.)?(?:[mc])?tsx?$/;

// Node resolves only `./…` and `../…` against the importer, so `.foo` is a bare specifier and appending
// an extension would leave it as unloadable as before. `.` and `..` stay in scope: rewriting them to
// `./index.js` does make them loadable.
const RELATIVE_SPECIFIER = /^\.\.?(?:$|\/)/;

// Resolved by a bundler, or reinterpreted by Node's URL-based resolver. Left alone either way.
const NOT_A_PLAIN_PATH = /[!?#%]/;

// Safe to drop into a quoted specifier as-is. Anything else goes through JSON.stringify, so a fix
// cannot emit code that fails to parse.
const PLAIN_SPECIFIER = /^[\w./@+~ -]+$/;

// A component directory is read hundreds of times, once per specifier. The TTL keeps a long-lived
// process such as an editor language server from pinning a stale listing.
const CACHE_TTL_MS = 2000;
const directoryCache = new Map();

function readDirectory(directory) {
  const cached = directoryCache.get(directory);
  const now = Date.now();
  if (cached && now - cached.time < CACHE_TTL_MS) {
    return cached.entries;
  }
  const entries = new Map();
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const kind = entry.isSymbolicLink() ? followLink(path.join(directory, entry.name)) : kindOf(entry);
      if (kind) {
        entries.set(entry.name, kind);
      }
    }
  } catch {
    // A missing or unreadable directory is treated as empty, which surfaces as `unresolvable`.
  }
  directoryCache.set(directory, { time: now, entries });
  return entries;
}

// Sockets, FIFOs and dangling symlinks are neither, and must not become the evidence for a fix.
function kindOf(stats) {
  if (stats.isDirectory()) {
    return "directory";
  }
  return stats.isFile() ? "file" : undefined;
}

function followLink(absolute) {
  try {
    const stats = fs.statSync(absolute, { throwIfNoEntry: false });
    return stats ? kindOf(stats) : undefined;
  } catch {
    return undefined;
  }
}

// Deliberately case-sensitive. `fs.existsSync` accepts `./Foo` for `foo.ts` on macOS and Windows, so an
// existence check would certify a specifier that fails to resolve on a Linux CI machine.
function isFile(absolute) {
  return readDirectory(path.dirname(absolute)).get(path.basename(absolute)) === "file";
}

function findIndex(directory) {
  return PROBE_ORDER.find(extension => isFile(path.join(directory, `index${extension}`)));
}

const NOT_RESOLVED = { fileExtension: undefined, indexExtension: undefined, existsAsWritten: false };

// Node resolves an ESM specifier as a URL, so dot segments are removed by string math before the
// filesystem is consulted: `./missing/../leaf.js` loads `./leaf.js` whether or not `missing` exists.
// A leading `..` has nothing to pop and stays.
function normalizeSegments(segments) {
  const kept = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === ".." && kept.length > 0 && kept[kept.length - 1] !== "..") {
      kept.pop();
      continue;
    }
    kept.push(segment);
  }
  return kept;
}

function resolveSpecifier(fromFile, specifier, preferExtension) {
  const segments = specifier.split("/");
  const lastSegment = segments[segments.length - 1];
  // Taken from the specifier as written, so normalization never decides the file-or-directory question.
  // Probing `.` as a file would look at a sibling of the directory: `.` in `a/b/importer.ts` tests `a/b.ts`.
  const directoryOnly = lastSegment === "" || lastSegment === "." || lastSegment === "..";

  // Walked rather than resolved in one call, so every directory is verified with exact case. readdirSync
  // succeeds on a mis-cased directory, which would otherwise certify `./Sub/leaf` for `sub/leaf.ts`.
  let directory = path.dirname(fromFile);
  for (const segment of normalizeSegments(directoryOnly ? segments : segments.slice(0, -1))) {
    if (segment === "..") {
      directory = path.dirname(directory);
      continue;
    }
    if (readDirectory(directory).get(segment) !== "directory") {
      return NOT_RESOLVED;
    }
    directory = path.join(directory, segment);
  }

  if (directoryOnly) {
    return { ...NOT_RESOLVED, indexExtension: findIndex(directory) };
  }
  const kind = readDirectory(directory).get(lastSegment);
  // Prepended rather than replacing the order, so a specifier naming a source that is not on disk still
  // resolves onto whatever is.
  const probeOrder = preferExtension ? [preferExtension, ...PROBE_ORDER] : PROBE_ORDER;
  return {
    fileExtension: probeOrder.find(extension => isFile(path.join(directory, lastSegment + extension))),
    indexExtension: kind === "directory" ? findIndex(path.join(directory, lastSegment)) : undefined,
    existsAsWritten: kind === "file",
  };
}

function directorySpecifier(specifier, extension) {
  const index = `index${EMITTED_EXTENSION[extension]}`;
  return specifier.endsWith("/") ? specifier + index : `${specifier}/${index}`;
}

// A specifier that already names an emitted file. Skipping these makes the rule idempotent and protects
// build-generated targets such as `./styles.css.js`. Separate from `hasExtension` because
// `./looks-emitted.js` beside a `looks-emitted.js.ts` would otherwise be "fixed" to `./looks-emitted.js.js`.
const EMITTED_SPECIFIER = /\.(?:m|c)?js$/;

// Whether the specifier already ends in something that looks like an extension.
function hasExtension(specifier) {
  const lastSegment = specifier.slice(specifier.lastIndexOf("/") + 1);
  if (lastSegment === "" || lastSegment === "." || lastSegment === "..") {
    return false;
  }
  // `> 0` rather than `!== -1` so a dotfile such as `./.eslintrc` is not read as an extension.
  return lastSegment.lastIndexOf(".") > 0;
}

// The specifier a node names, when that is knowable without running the program. A template literal with
// no substitutions is as statically known as a string, and TypeScript emits it verbatim.
function staticSpecifier(node) {
  if (node?.type === "Literal") {
    return typeof node.value === "string" ? node.value : undefined;
  }
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked;
  }
  return undefined;
}

// Keeps the file's existing quote style so the fix does not fight Prettier. A template literal becomes a
// quoted string rather than another template, because a cooked specifier may contain a backtick or `${`.
function requote(text, original) {
  const quote = original.startsWith('"') ? '"' : "'";
  return PLAIN_SPECIFIER.test(text) ? quote + text + quote : JSON.stringify(text);
}

export default {
  meta: {
    type: "problem",
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          // Regular expressions matched against the specifier, for paths that only exist after a build,
          // e.g. `["/lib/"]` for imports into this package's own output.
          ignore: {
            type: "array",
            items: { type: "string" },
          },
          // Stay silent about specifiers that resolve to nothing. Does not cover one naming a TypeScript
          // source, which is wrong however the tree is built.
          allowUnresolved: {
            type: "boolean",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missing: "Relative import '{{specifier}}' needs an explicit file extension. Use '{{emitted}}'.",
      tsExtension:
        "Relative import '{{specifier}}' names a TypeScript source file, which is not what the build emits. Use '{{emitted}}'.",
      tsExtensionUnresolved:
        "Relative import '{{specifier}}' names a TypeScript source file, which is not what the build emits, and does not resolve to a file. Correct the path, then name the emitted file.",
      ambiguous:
        "Relative import '{{specifier}}' is ambiguous: both a '{{specifier}}' file and a '{{specifier}}/index' file exist. Rename one of them, or import the intended file explicitly.",
      unresolvable:
        "Relative import '{{specifier}}' does not resolve to a file. Check the path and its capitalization, which matters on Linux.",
    },
    docs: {
      description:
        "Requires relative import specifiers to name the emitted file explicitly ('./x.js', './x/index.js'), so that the published package can be loaded by Node's ESM resolver, which neither probes extensions nor falls back to a directory index.",
    },
  },
  create(context) {
    const { ignore = [], allowUnresolved = false } = context.options[0] ?? {};
    const ignorePatterns = ignore.map(pattern => {
      try {
        return new RegExp(pattern);
      } catch (error) {
        throw new Error(`Invalid "ignore" pattern ${JSON.stringify(pattern)}: ${error.message}`);
      }
    });
    const { filename, sourceCode } = context;

    // Linting stdin without a filename gives a name nothing can be resolved against: `<text>` on
    // eslintrc configs, `<cwd>/__placeholder__.js` on flat configs.
    if (!filename || filename.startsWith("<") || path.basename(filename).startsWith("__placeholder__")) {
      return {};
    }

    function report(node, messageId, specifier, emitted) {
      context.report({
        node,
        messageId,
        data: { specifier, emitted },
        fix: emitted ? fixer => fixer.replaceText(node, requote(emitted, sourceCode.getText(node))) : undefined,
      });
    }

    function check(node) {
      const specifier = staticSpecifier(node);
      if (specifier === undefined) {
        return;
      }
      if (!RELATIVE_SPECIFIER.test(specifier) || NOT_A_PLAIN_PATH.test(specifier)) {
        return;
      }
      if (ignorePatterns.some(pattern => pattern.test(specifier))) {
        return;
      }

      const tsExtension = TS_SPECIFIER.exec(specifier);
      if (tsExtension) {
        const stem = specifier.slice(0, tsExtension.index);
        // An implementation source the specifier names is probed first, so the fix never retargets onto a
        // different module: `./x.mts` beside both `x.ts` and `x.mts` emits `./x.mjs`. The map membership
        // test drops `.mtsx`, which `TS_SPECIFIER` matches and nothing emits.
        const named = tsExtension[0];
        const preferred = named in EMITTED_EXTENSION && !named.startsWith(".d.") ? named : undefined;
        const { fileExtension, indexExtension } = resolveSpecifier(filename, stem, preferred);
        // Reported whatever is on disk, because a TypeScript extension is always wrong here, but fixed
        // only from evidence.
        if (fileExtension) {
          report(node, "tsExtension", specifier, stem + EMITTED_EXTENSION[fileExtension]);
        } else if (indexExtension) {
          report(node, "tsExtension", specifier, directorySpecifier(stem, indexExtension));
        } else {
          report(node, "tsExtensionUnresolved", specifier);
        }
        return;
      }
      if (EMITTED_SPECIFIER.test(specifier)) {
        return;
      }

      const { fileExtension, indexExtension, existsAsWritten } = resolveSpecifier(filename, specifier);

      // A dotted last segment usually names a real non-TypeScript target such as `./styles.scss`, which is
      // out of scope. It is in scope only when a TypeScript source backs the dotted stem and the specifier
      // does not already name a file, so `./format.helper` beside `format.helper.ts` is fixed while
      // `./styles.scoped.css` is left alone. Checked after resolution because the disk distinguishes them.
      if (hasExtension(specifier) && (existsAsWritten || (!fileExtension && !indexExtension))) {
        return;
      }

      if (fileExtension && indexExtension) {
        report(node, "ambiguous", specifier);
      } else if (fileExtension) {
        report(node, "missing", specifier, specifier + EMITTED_EXTENSION[fileExtension]);
      } else if (indexExtension) {
        report(node, "missing", specifier, directorySpecifier(specifier, indexExtension));
      } else if (!existsAsWritten && !allowUnresolved) {
        report(node, "unresolvable", specifier);
      }
    }

    return {
      ImportDeclaration: node => check(node.source),
      ImportExpression: node => check(node.source),
      ExportAllDeclaration: node => check(node.source),
      ExportNamedDeclaration: node => check(node.source),
    };
  },
};
