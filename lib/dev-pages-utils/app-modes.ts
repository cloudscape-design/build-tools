// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import mapValues from "lodash/mapValues";

// Keep in sync with the Mode/Density/Theme enums in @cloudscape-design/global-styles.
export type AppMode = "light" | "dark";
export type AppDensity = "comfortable" | "compact";
export type AppTheme = "default" | "visual-refresh" | "one-theme";

export interface AppUrlParams {
  mode: AppMode;
  density: AppDensity;
  direction: "ltr" | "rtl";
  motionDisabled: boolean;
  theme?: AppTheme;
  i18n?: boolean;
  screenshotMode?: boolean;
}

export interface AppContextType<T = unknown> {
  pageId?: string;
  urlParams: AppUrlParams & T;
  setUrlParams: (newParams: Partial<AppUrlParams & T>) => void;
}

export type ApplyAppModes<T = unknown> = (params: AppUrlParams & T, target?: Element) => void;

export const appModesDefaults: AppUrlParams = {
  mode: "light",
  density: "comfortable",
  direction: "ltr",
  motionDisabled: false,
  i18n: true,
  screenshotMode: false,
};

export function parseAppModes(searchParams: URLSearchParams): AppUrlParams {
  const queryParams: Record<string, any> = { ...appModesDefaults };
  searchParams.forEach((value, key) => (queryParams[key] = value));

  return mapValues(queryParams, value => {
    if (value === "true" || value === "false") {
      return value === "true";
    }
    return value;
  }) as AppUrlParams;
}

export function formatAppModes<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

// Reloads on direction change: some components read the document `dir` only at mount.
export function updateAppModes(
  current: AppUrlParams,
  next: Partial<AppUrlParams>,
  setQuery: (query: Record<string, string>) => void,
): void {
  const merged = { ...current, ...next };
  setQuery(formatAppModes(merged));
  if ((next.direction ?? current.direction) !== current.direction) {
    window.location.reload();
  }
}
