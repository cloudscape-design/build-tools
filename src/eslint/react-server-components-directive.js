// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import micromatch from "micromatch";
import path from "node:path";

export default {
  meta: {
    fixable: "code",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entryFilesPattern: {
            type: "string",
          },
        },
      },
    },
  },
  create(context) {
    const entryFilesPattern = path.resolve(context.options[0]?.entryFilesPattern ?? "./src/*/index.{ts,tsx}");
    const filename = path.resolve(context.filename);
    const isEntryFile = micromatch.isMatch(filename, entryFilesPattern);
    return {
      Program(node) {
        const useClientDirective = node.body.find(node => node.directive === "use client");
        if (isEntryFile && !useClientDirective) {
          context.report({
            node,
            message: 'Missing "use client" directive on the entry file.',
            fix(fixer) {
              return fixer.insertTextBefore(node.body[0], '"use client";\n');
            },
          });
        }
        if (!isEntryFile && useClientDirective) {
          context.report({
            node,
            message: 'Unexpected "use client" directive inside an internal file.',
            fix(fixer) {
              return fixer.remove(useClientDirective);
            },
          });
        }
      },
    };
  },
};
