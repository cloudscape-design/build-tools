// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import micromatch from "micromatch";
import path from "node:path";

/**
 * Secures the public interfaces contract shared across Cloudscape component repositories
 * (components, chat-components, board-components, code-view, chart-components).
 *
 * Public component interface files (by convention `src/{component}/interfaces.{ts,tsx}`) must
 * expose ONLY public API types, so downstream design systems can safely proxy/extend them. Any
 * intra-repo type can otherwise leak into a public interface by mistake (internal helpers,
 * implementation files, `src/internal/**`, a sibling `internal-interfaces.ts`, etc.), so this rule
 * uses an allowlist rather than a denylist.
 *
 * Within a public interface file, an import / re-export source is allowed only when it is:
 *   - an external package (a non-relative specifier, e.g. `react`, `@cloudscape-design/*`); or
 *   - another component's public interface file (a relative path ending in `/interfaces`); or
 *   - the shared public types location (`src/types`, a relative path with a `types/` segment).
 *
 * It also forbids declaring or re-exporting `Internal*` named types in the public file. The rule is
 * a no-op outside public interface files, so internal files (internal-interfaces.ts, src/internal,
 * nested sub-module interfaces) are unaffected.
 *
 * The set of files treated as public interfaces is configurable via the `publicInterfacesPattern`
 * option (a glob resolved against the project root); it defaults to the shared Cloudscape
 * convention, so the rule works out of the box in every component repo.
 */

const DEFAULT_PUBLIC_INTERFACES_PATTERN = "./src/*/interfaces.{ts,tsx}";

// Names starting with `Internal` followed by an upper-case letter are, by convention, internal types.
const INTERNAL_NAME_RE = /^Internal[A-Z]/;

// Extracts the component segment from a `.../src/{component}/interfaces.ts(x)` path.
const COMPONENT_RE = /(?:^|\/)src\/([^/]+)\/interfaces\.tsx?$/;

// Directory buckets under `src/` that are never public component interfaces.
const NON_COMPONENT_SEGMENTS = new Set(["internal", "types"]);

/**
 * Whether a module specifier is an allowed import source for a public interface file.
 */
function isAllowedSource(source) {
  if (typeof source !== "string") {
    return true;
  }
  // External packages (anything that is not a relative path). The contract targets intra-repo types.
  if (!source.startsWith(".")) {
    return true;
  }
  // Another component's public interface file, e.g. `../button/interfaces.js`.
  // Note: `internal-interfaces` ends in `-interfaces`, not `/interfaces`, so it is NOT allowed.
  if (/\/interfaces(?:\.(?:m|c)?js)?$/.test(source)) {
    return true;
  }
  // The shared public types location, e.g. `../types/base-component`.
  if (/(?:^|\/)types\//.test(source)) {
    return true;
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          publicInterfacesPattern: {
            type: "string",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      internalDeclaration:
        "'{{name}}' looks like an internal type and must not be declared in a public interface file. Move it to a colocated 'internal-interfaces.ts' file.",
      disallowedImport:
        "Public interface files may only import from another component's interfaces (e.g. '../button/interfaces') or shared public types ('src/types'). Importing from '{{source}}' is not allowed — if it is a public type, move it to 'src/types' and import it from there.",
      disallowedReexport:
        "Public interface files may only re-export from another component's interfaces or shared public types ('src/types'). Re-exporting from '{{source}}' is not allowed, as it can expose internal types through the public API surface.",
      internalReexportName: "Public interface files must not export '{{name}}' under an internal name.",
    },
    docs: {
      description:
        "Restricts imports in public component interface files to other component interfaces or shared public types (src/types), preventing internal types from leaking into the public API surface.",
    },
  },
  create(context) {
    const pattern = path.resolve(context.options[0]?.publicInterfacesPattern ?? DEFAULT_PUBLIC_INTERFACES_PATTERN);
    const filename = path.resolve(context.filename ?? context.getFilename());
    const normalized = filename.replace(/\\/g, "/");

    if (!micromatch.isMatch(filename, pattern)) {
      return {};
    }
    // Skip the internal/types buckets, which are not public component interfaces.
    const componentMatch = COMPONENT_RE.exec(normalized);
    if (componentMatch && NON_COMPONENT_SEGMENTS.has(componentMatch[1])) {
      return {};
    }

    function reportInternalName(node, name) {
      if (name && INTERNAL_NAME_RE.test(name)) {
        context.report({ node, messageId: "internalDeclaration", data: { name } });
      }
    }

    return {
      // Declaring an internal-named type (exported or not) in the public file.
      TSInterfaceDeclaration(node) {
        reportInternalName(node.id, node.id && node.id.name);
      },
      TSTypeAliasDeclaration(node) {
        reportInternalName(node.id, node.id && node.id.name);
      },
      TSEnumDeclaration(node) {
        reportInternalName(node.id, node.id && node.id.name);
      },

      // Imports must come from an allowed source.
      ImportDeclaration(node) {
        const source = node.source && node.source.value;
        if (!isAllowedSource(source)) {
          context.report({ node, messageId: "disallowedImport", data: { source } });
        }
      },

      // Re-exports must come from an allowed source; bindings must not be exposed under an internal name.
      ExportNamedDeclaration(node) {
        const source = node.source && node.source.value;
        if (!isAllowedSource(source)) {
          context.report({ node, messageId: "disallowedReexport", data: { source } });
          return;
        }
        for (const spec of node.specifiers || []) {
          const exportedName = spec.exported && spec.exported.name;
          if (exportedName && INTERNAL_NAME_RE.test(exportedName)) {
            context.report({ node: spec, messageId: "internalReexportName", data: { name: exportedName } });
          }
        }
      },
      ExportAllDeclaration(node) {
        const source = node.source && node.source.value;
        if (!isAllowedSource(source)) {
          context.report({ node, messageId: "disallowedReexport", data: { source } });
        }
      },
    };
  },
};
