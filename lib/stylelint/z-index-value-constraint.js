// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import stylelint from "stylelint";

const ruleName = "@cloudscape-design/z-index-value-constraint";

const messages = stylelint.utils.ruleMessages(ruleName, {
  noNegativeZIndex: zIndexValue => {
    return `Avoid using negative z-index values: ${zIndexValue}.
    This can cause the element to disappear behind its container's background color.`;
  },
});

function zIndexValueConstraint(enabled) {
  if (!enabled) {
    return;
  }

  return function (root, result) {
    root.walkDecls(function (decl) {
      if (decl.prop !== "z-index") return;

      const zIndexValue = Number(decl.value);

      // If the z-index value is not a number (e.g. variable), don't throw an error.
      if (Number.isNaN(zIndexValue)) return;

      if (zIndexValue < 0) {
        stylelint.utils.report({
          result,
          ruleName,
          message: messages.noNegativeZIndex(zIndexValue),
          node: decl,
        });
      }
    });
  };
}

zIndexValueConstraint.ruleName = ruleName;
zIndexValueConstraint.messages = messages;

export default stylelint.createPlugin(ruleName, zIndexValueConstraint);
