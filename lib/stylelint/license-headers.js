// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import stylelint from "stylelint";

const ruleName = "@cloudscape-design/license-headers";
const commentTypes = ["block", "line"];
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: "Missing license header",
  wrongCommentType: commentType =>
    commentType === "line"
      ? "License header must use line comments (//)"
      : "License header must use a block comment (/* */)",
});

const isLineComment = comment => comment.raws.inline === true || comment.inline === true;

/**
 * Compares headers line by line, ignoring indentation, so that a single `header` option
 * works for both comment types: postcss keeps the leading space on the continuation
 * lines of a block comment but strips it from every line comment.
 */
const normalize = text =>
  text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");

/** The run of comments at the very top of the file, which is where a header may live. */
function leadingComments(root) {
  const comments = [];
  for (let node = root.first; node && node.type === "comment"; node = node.next()) {
    comments.push(node);
  }
  return comments;
}

function findBlockHeader(comments, normalizedHeader) {
  const [first] = comments;
  if (!first || isLineComment(first) || normalize(first.text) !== normalizedHeader) {
    return null;
  }
  return [first];
}

function findLineHeader(comments, normalizedHeader, headerLineCount) {
  const run = [];
  for (const comment of comments) {
    if (!isLineComment(comment)) {
      break;
    }
    run.push(comment);
  }

  const candidate = run.slice(0, headerLineCount);
  if (candidate.length < headerLineCount) {
    return null;
  }
  if (normalize(candidate.map(comment => comment.text).join("\n")) !== normalizedHeader) {
    return null;
  }
  return candidate;
}

function prependHeader(root, header, commentType) {
  if (commentType === "block") {
    root.prepend(`/*${header}*/\n\n`);
    return;
  }

  // `root.prepend(string)` parses with postcss' CSS parser, which cannot produce line
  // comments, so build the nodes instead. Prepending in reverse keeps the header order.
  const lines = normalize(header).split("\n");
  for (const text of [...lines].reverse()) {
    root.prepend({ text, raws: { inline: true, left: " ", right: "" } });
  }
  root.nodes.slice(0, lines.length).forEach((node, index) => {
    node.raws.before = index === 0 ? "" : "\n";
  });
  const nextNode = root.nodes[lines.length];
  if (nextNode) {
    nextNode.raws.before = "\n\n";
  }
}

/**
 * Requires a license header at the top of every stylesheet.
 *
 * `commentType` selects the form the header takes, and defaults to `block`:
 *
 * - `block` writes a CSS block comment, which Sass copies into the compiled CSS.
 * - `line` writes Sass line comments, which Sass strips. Use it for partials, whose
 *   header would otherwise be repeated in the output of every entry point that
 *   `@use`s them.
 */
function licenseHeadersPlugin(enabled, { header, commentType = "block" } = {}, context) {
  if (!enabled) {
    return;
  }

  if (!header) {
    throw new Error(`stylelint ${ruleName} rule requires a header option.`);
  }

  if (!commentTypes.includes(commentType)) {
    throw new Error(`stylelint ${ruleName} rule option "commentType" must be one of: ${commentTypes.join(", ")}.`);
  }

  const normalizedHeader = normalize(header);
  const headerLineCount = normalizedHeader.split("\n").length;

  return (root, result) => {
    const comments = leadingComments(root);
    const blockHeader = findBlockHeader(comments, normalizedHeader);
    const lineHeader = findLineHeader(comments, normalizedHeader, headerLineCount);
    const isLine = commentType === "line";
    const found = isLine ? lineHeader : blockHeader;
    const foundOtherType = isLine ? blockHeader : lineHeader;

    if (found) {
      return;
    }

    if (context.fix) {
      // A header in the other comment type is still the header, so replace it rather
      // than leaving the file with two.
      foundOtherType?.forEach(comment => comment.remove());
      prependHeader(root, header, commentType);
    } else {
      stylelint.utils.report({
        message: foundOtherType ? messages.wrongCommentType(commentType) : messages.rejected,
        node: comments[0] ?? root,
        result,
        ruleName,
      });
    }
  };
}

licenseHeadersPlugin.ruleName = ruleName;
licenseHeadersPlugin.messages = messages;

export default stylelint.createPlugin(ruleName, licenseHeadersPlugin);
