// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from "vitest";
import { createPermutations, ComponentPermutations } from "../permutations";

describe("createPermutations", () => {
  test("creates permutations from a single set with multiple properties", () => {
    interface Props {
      color: string;
      size: string;
    }
    const permutations: ComponentPermutations<Props> = {
      color: ["red", "blue"],
      size: ["small", "large"],
    };

    const result = createPermutations([permutations]);

    expect(result).toEqual([
      { color: "red", size: "small" },
      { color: "red", size: "large" },
      { color: "blue", size: "small" },
      { color: "blue", size: "large" },
    ]);
  });

  test("creates permutations from multiple sets", () => {
    interface Props {
      variant: string;
      disabled: boolean;
    }
    const set1: ComponentPermutations<Props> = {
      variant: ["primary", "secondary"],
      disabled: [false],
    };
    const set2: ComponentPermutations<Props> = {
      variant: ["link"],
      disabled: [true, false],
    };

    const result = createPermutations([set1, set2]);

    expect(result).toEqual([
      { variant: "primary", disabled: false },
      { variant: "secondary", disabled: false },
      { variant: "link", disabled: true },
      { variant: "link", disabled: false },
    ]);
  });

  test("flattens results from multiple sets correctly", () => {
    interface Props {
      type: string;
    }
    const set1: ComponentPermutations<Props> = {
      type: ["a", "b"],
    };
    const set2: ComponentPermutations<Props> = {
      type: ["c"],
    };
    const set3: ComponentPermutations<Props> = {
      type: ["d", "e"],
    };

    const result = createPermutations([set1, set2, set3]);

    expect(result).toEqual([{ type: "a" }, { type: "b" }, { type: "c" }, { type: "d" }, { type: "e" }]);
  });
});
