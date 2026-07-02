// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi } from "vitest";

// global-styles is a workspace sibling that is not installed in this package's node_modules.
// app-modes.ts imports it at module load, so we stub it with the real enum string values.
vi.mock("@cloudscape-design/global-styles", () => ({
  Mode: { Light: "light", Dark: "dark" },
  Density: { Comfortable: "comfortable", Compact: "compact" },
  Theme: { Default: "default", VisualRefresh: "visual-refresh", OneTheme: "one-theme" },
  applyMode: () => {},
  applyDensity: () => {},
  applyTheme: () => {},
  disableMotion: () => {},
}));

const { appModesDefaults, formatAppModes, updateAppModes } = await import("../app-modes");

describe("formatAppModes", () => {
  test("serializes every param to a string (full URL, no omission)", () => {
    expect(formatAppModes(appModesDefaults)).toEqual({
      mode: "light",
      density: "comfortable",
      direction: "ltr",
      motionDisabled: "false",
      theme: "default",
      i18n: "true",
      screenshotMode: "false",
    });
  });

  test("skips undefined values", () => {
    expect(formatAppModes({ mode: "dark", appLayoutToolbar: undefined })).toEqual({ mode: "dark" });
  });
});

describe("updateAppModes", () => {
  test("writes the full serialized query through setQuery", () => {
    const setQuery = vi.fn();
    updateAppModes(appModesDefaults, { mode: "dark" as any }, setQuery);
    expect(setQuery).toHaveBeenCalledWith({
      mode: "dark",
      density: "comfortable",
      direction: "ltr",
      motionDisabled: "false",
      theme: "default",
      i18n: "true",
      screenshotMode: "false",
    });
  });

  test("does not reload when direction is unchanged", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    updateAppModes(appModesDefaults, { mode: "dark" as any }, vi.fn());
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
    updateAppModes({ ...appModesDefaults, direction: "rtl" }, { mode: "dark" as any }, vi.fn());
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
