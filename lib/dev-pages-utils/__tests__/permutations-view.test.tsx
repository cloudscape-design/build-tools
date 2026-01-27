// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import React from "react";
import { PermutationsView } from "../permutations-view";

describe("PermutationsView", () => {
  test("renders permutations with correct structure", () => {
    const permutations = [{ label: "First" }, { label: "Second" }];

    const result = PermutationsView({
      permutations,
      render: props => <div>{props.label}</div>,
    });

    expect(result.type).toBe("div");
    expect(result.props.style).toEqual({ display: "flex", flexDirection: "column", gap: "16px" });
    expect(result.props.children).toHaveLength(2);
  });

  test("applies data-permutation attribute", () => {
    const permutations = [{ value: "a" }];

    const result = PermutationsView({
      permutations,
      render: props => <span>{props.value}</span>,
    });

    expect(result.props.children[0].props["data-permutation"]).toBe('{"value":"a"}');
  });

  test("uses data-permutation as key", () => {
    const permutations = [{ id: 1 }];

    const result = PermutationsView({
      permutations,
      render: props => <div>{props.id}</div>,
    });

    expect(result.props.children[0].key).toBe('{"id":1}');
  });

  test("passes index to render function", () => {
    const permutations = [{ name: "first" }, { name: "second" }];
    const indices: number[] = [];

    PermutationsView({
      permutations,
      render: (props, index) => {
        if (index !== undefined) indices.push(index);
        return <div>{props.name}</div>;
      },
    });

    expect(indices).toEqual([0, 1]);
  });

  test("handles empty permutations", () => {
    const result = PermutationsView({
      permutations: [] as Array<{ value: string }>,
      render: props => <div>{props.value}</div>,
    });

    expect(result.props.children).toHaveLength(0);
  });

  test("throws error when exceeding maximum permutations", () => {
    const permutations = Array.from({ length: 277 }, (_, i) => ({ id: i }));

    expect(() => {
      PermutationsView({
        permutations,
        render: props => <div>{props.id}</div>,
      });
    }).toThrow("Too many permutations (277), maximum is 276");
  });

  test("allows exactly 276 permutations", () => {
    const permutations = Array.from({ length: 276 }, (_, i) => ({ id: i }));

    const result = PermutationsView({
      permutations,
      render: props => <div>{props.id}</div>,
    });

    expect(result.props.children).toHaveLength(276);
  });

  test("renders with horizontal direction", () => {
    const permutations = [{ label: "First" }];

    const result = PermutationsView({
      permutations,
      render: props => <div>{props.label}</div>,
      direction: "horizontal",
    });

    expect(result.props.style.flexDirection).toBe("row");
  });

  test("defaults to vertical direction", () => {
    const permutations = [{ label: "First" }];

    const result = PermutationsView({
      permutations,
      render: props => <div>{props.label}</div>,
    });

    expect(result.props.style.flexDirection).toBe("column");
  });
});
