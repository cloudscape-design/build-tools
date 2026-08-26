// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import stylelint from "stylelint";

const ruleName = "@cloudscape-design/no-motion-outside-of-mixin";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: property => `Property "${property}" should be directly under 'with-motion' helper`,
});

function findUpUntil(node, callback) {
  let current = node;
  while (current && !callback(current)) {
    current = current.parent;
  }
  return current;
}

// Sass control flow exists only at compile time: a declaration separated from the
// with-motion include solely by these at-rules compiles to a direct child of the gate.
const controlFlowAtRules = new Set(["if", "else", "each", "for", "while"]);

function isUnderMotionMixin(decl) {
  let parent = decl.parent;
  while (parent && parent.type === "atrule" && controlFlowAtRules.has(parent.name)) {
    parent = parent.parent;
  }
  return parent && parent.type === "atrule" && parent.name === "include" && parent.params.endsWith("with-motion");
}

function noMotionOutsideOfMixinPlugin() {
  return (root, result) => {
    root.walkDecls(/animation|transition/, decl => {
      // sass variables are okay, because they do not produce CSS
      if (decl.prop.startsWith("$")) {
        return;
      }
      const isInKeyframes = findUpUntil(decl, node => node.type === "atrule" && node.name === "keyframes");

      if (!isUnderMotionMixin(decl) && !isInKeyframes) {
        stylelint.utils.report({
          result,
          ruleName,
          message: messages.rejected(decl.prop),
          node: decl,
        });
      }
    });
  };
}
noMotionOutsideOfMixinPlugin.ruleName = ruleName;
noMotionOutsideOfMixinPlugin.messages = messages;

export default stylelint.createPlugin(ruleName, noMotionOutsideOfMixinPlugin);
