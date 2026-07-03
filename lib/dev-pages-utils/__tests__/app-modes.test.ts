// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from "vitest";

import { Density, Mode } from "@cloudscape-design/global-styles";

import { appModesDefaults, formatAppModes, updateAppModes } from "../app-modes";

describe("formatAppModes", () => {
  test("serializes every param to a string (full URL, no omission)", () => {
    expect(formatAppModes(appModesDefaults)).toEqual({
      mode: "light",
      density: "comfortable",
      direction: "ltr",
      motionDisabled: "false",
      i18n: "true",
      screenshotMode: "false",
    });
  });

  test("skips undefined values", () => {
    expect(formatAppModes({ mode: Mode.Dark, appLayoutToolbar: undefined })).toEqual({ mode: "dark" });
  });
});

describe("updateAppModes", () => {
  test("writes the full serialized query through setQuery", () => {
    const setQuery = vi.fn();
    updateAppModes(appModesDefaults, { mode: Mode.Dark }, setQuery);
    expect(setQuery).toHaveBeenCalledWith({
      mode: "dark",
      density: "comfortable",
      direction: "ltr",
      motionDisabled: "false",
      i18n: "true",
      screenshotMode: "false",
    });
  });

  test("does not reload when direction is unchanged", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    updateAppModes(appModesDefaults, { mode: Mode.Dark }, vi.fn());
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test("reloads when direction changes via next", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    updateAppModes(appModesDefaults, { direction: "rtl" }, vi.fn());
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  test("does not reload when next omits direction even if current is non-default", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    updateAppModes({ ...appModesDefaults, direction: "rtl" }, { density: Density.Compact }, vi.fn());
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
