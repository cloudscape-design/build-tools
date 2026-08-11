// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import queryString from "query-string";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  ApplyAppModes,
  AppContextType,
  appModesDefaults,
  AppUrlParams,
  parseAppModes,
  updateAppModes,
} from "./app-modes.js";

/**
 * Reads the query-string portion of the current hash, e.g. for
 * `/#/some/path?mode=dark` it returns `URLSearchParams("mode=dark")`.
 */
export function getHashSearchParams(): URLSearchParams {
  // The leading "#" is stripped because query-string treats it as a fragment
  // delimiter and discards everything after it.
  return new URLSearchParams(queryString.extract(window.location.hash.slice(1)));
}

/**
 * Writes a new set of query params into the hash, preserving the path portion,
 * e.g. `/#/some/path` + `{ mode: "dark" }` → `/#/some/path?mode=dark`.
 */
export function setHashSearchParams(params: Record<string, string>): void {
  const [hashPath] = window.location.hash.split("?");
  // `sort: false` keeps the params in insertion order, as URLSearchParams did.
  const search = queryString.stringify(params, { sort: false });
  const newHash = search ? `${hashPath}?${search}` : hashPath;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
  // Dispatch a hashchange event so any other listeners (including our own hook) stay in sync.
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/**
 * Drop-in replacement for react-router-dom's useSearchParams, scoped to the
 * hash query string. Does not require a Router context.
 */
function useHashSearchParams(): [URLSearchParams, (params: Record<string, string>) => void] {
  const [searchParams, setSearchParams] = useState<URLSearchParams>(getHashSearchParams);

  useEffect(() => {
    function handleHashChange() {
      setSearchParams(getHashSearchParams());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return [searchParams, setHashSearchParams];
}

const AppModesContext = createContext<AppContextType>({
  urlParams: appModesDefaults,
  setUrlParams: () => {},
});

export function AppModesProvider({ children, applyModes }: { children: ReactNode; applyModes: ApplyAppModes }) {
  const [searchParams, setSearchParams] = useHashSearchParams();

  const urlParams = useMemo(() => parseAppModes(searchParams), [searchParams]);

  const setUrlParams = useCallback(
    (newParams: Partial<AppUrlParams>) => updateAppModes(urlParams, newParams, setSearchParams),
    [urlParams, setSearchParams],
  );

  useEffect(() => {
    document.documentElement.setAttribute("dir", urlParams.direction);
    applyModes(urlParams);
  }, [urlParams, applyModes]);

  const value = useMemo<AppContextType>(() => ({ urlParams, setUrlParams }), [urlParams, setUrlParams]);

  return <AppModesContext.Provider value={value}>{children}</AppModesContext.Provider>;
}

// Pass a type argument for package-specific params, e.g. useAppModes<{ myFlag: boolean }>().
export function useAppModes<T = unknown>(): AppContextType<T> {
  return useContext(AppModesContext) as AppContextType<T>;
}
