// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import stylelint from "stylelint";

const ruleName = "@cloudscape-design/no-mixed-units-in-math-functions";

const messages = stylelint.utils.ruleMessages(ruleName, {
  mixedUnits: value => {
    return `Avoid mixing units in CSS math functions: ${value}.
    Sass evaluates max()/min()/clamp() at compile time and rejects incompatible units.`;
  },
});

// Extracts all numeric+unit tokens from a string, including inside nested functions
const ALL_UNITS_REGEX = /(?<!\w)-?[\d.]+([a-z%]+)/gi;

/**
 * Finds the matching closing paren for a math function call starting at `startIdx`
 * (the index right after the opening paren).
 */
function findClosingParen(value, startIdx) {
  let depth = 1;
  let i = startIdx;
  while (i < value.length && depth > 0) {
    if (value[i] === "(") depth++;
    if (value[i] === ")") depth--;
    i++;
  }
  return i;
}

/**
 * Extracts all units found in a string (including inside nested calc/var/etc).
 * Skips Sass variables ($foo) and interpolation (#{...}).
 */
function extractAllUnits(str) {
  const units = new Set();
  let match;
  ALL_UNITS_REGEX.lastIndex = 0;
  while ((match = ALL_UNITS_REGEX.exec(str)) !== null) {
    units.add(match[1].toLowerCase());
  }
  return units;
}

function noMixedUnitsInMathFunctions(enabled) {
  if (!enabled) {
    return;
  }

  return function (root, result) {
    root.walkDecls(function (decl) {
      const value = decl.value;

      // Find max(...), min(...), clamp(...) with nested-paren-aware matching
      const regex = /\b(max|min|clamp)\(/gi;
      let match;

      while ((match = regex.exec(value)) !== null) {
        const startIdx = match.index + match[0].length;
        const endIdx = findClosingParen(value, startIdx);
        const argsStr = value.slice(startIdx, endIdx - 1);

        // Skip if the content has Sass interpolation (#{...}) — already escaped
        if (argsStr.includes("#{")) {
          continue;
        }

        const units = extractAllUnits(argsStr);

        if (units.size > 1) {
          const fnCall = value.slice(match.index, endIdx);
          stylelint.utils.report({
            result,
            ruleName,
            message: messages.mixedUnits(fnCall),
            node: decl,
          });
        }
      }
    });
  };
}

noMixedUnitsInMathFunctions.ruleName = ruleName;
noMixedUnitsInMathFunctions.messages = messages;

export default stylelint.createPlugin(ruleName, noMixedUnitsInMathFunctions);
