// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  applyDensity,
  applyMode,
  applyTheme,
  disableMotion,
  Density,
  Mode,
  Theme,
} from "@cloudscape-design/global-styles";
import mapValues from "lodash/mapValues";

export interface AppUrlParams {
  mode: Mode;
  density: Density;
  direction: "ltr" | "rtl";
  motionDisabled: boolean;
  theme?: Theme;
  i18n?: boolean;
  screenshotMode?: boolean;
}

/**
 * Shared shape for a dev-pages app context.
 */
export interface AppContextType<T = unknown> {
  pageId?: string;
  urlParams: AppUrlParams & T;
  setUrlParams: (newParams: Partial<AppUrlParams & T>) => void;
}

export const appModesDefaults: AppUrlParams = {
  mode: Mode.Light,
  density: Density.Comfortable,
  direction: "ltr",
  motionDisabled: false,
  i18n: true,
  screenshotMode: false,
};

/**
 * Parses dev-pages URL params into a typed object.
 */
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

/**
 * Serializes params to a query record. Skips undefined values.
 */
export function formatAppModes<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

/**
 * Router-agnostic setter for app-modes URL state: serializes `current` merged with `next`, writes
 * it through the caller-provided `setQuery` (e.g. react-router's `setSearchParams`), and reloads
 * the page when `direction` changed.
 */
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

export function applyAppModes(params: AppUrlParams, target: Element = document.body): void {
  applyMode(params.mode, target);
  applyDensity(params.density, target);
  disableMotion(params.motionDisabled, target);
  applyTheme(params.theme ?? null, target);
  document.documentElement.setAttribute("dir", params.direction);
}
