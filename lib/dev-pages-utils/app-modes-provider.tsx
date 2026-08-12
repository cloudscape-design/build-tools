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
 * `/#/some/path?mode=dark` it returns `"mode=dark"`.
 */
function getHashSearch(): string {
  // The leading "#" is stripped because query-string treats it as a fragment
  // delimiter and discards everything after it.
  return queryString.extract(window.location.hash.slice(1));
}

/**
 * Reads the query-string portion of the current hash, e.g. for
 * `/#/some/path?mode=dark` it returns `URLSearchParams("mode=dark")`.
 */
export function getHashSearchParams(): URLSearchParams {
  return new URLSearchParams(getHashSearch());
}

/**
 * Writes a new set of query params into the hash, preserving the path portion,
 * e.g. `/#/some/path` + `{ mode: "dark" }` → `/#/some/path?mode=dark`. Pushes a
 * history entry, as react-router's setSearchParams did.
 */
export function setHashSearchParams(params: Record<string, string>): void {
  const [hashPath] = window.location.hash.split("?");
  // `sort: false` keeps the params in insertion order, and encoding spaces as
  // "+" matches URLSearchParams, which is what react-router serialised with.
  const search = queryString.stringify(params, { sort: false }).replace(/%20/g, "+");
  const newHash = search ? `${hashPath}?${search}` : hashPath;
  window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
}

/**
 * Notifies on every same-document location change, reproducing the trigger set
 * react-router's history gave `useSearchParams`. Browser-driven navigation fires
 * `hashchange` or `popstate`, but `pushState`/`replaceState` fire no event, so
 * the routers consumers navigate with are observed by wrapping them.
 */
export function subscribeToLocationChanges(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);

  const { pushState, replaceState } = window.history;
  window.history.pushState = function (...args: Parameters<History["pushState"]>) {
    pushState.apply(window.history, args);
    onChange();
  };
  window.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
    replaceState.apply(window.history, args);
    onChange();
  };

  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.history.pushState = pushState;
    window.history.replaceState = replaceState;
  };
}

/**
 * Drop-in replacement for react-router-dom's useSearchParams, scoped to the
 * hash query string. Does not require a Router context.
 */
function useHashSearchParams(): [URLSearchParams, (params: Record<string, string>) => void] {
  const [search, setSearch] = useState<string>(getHashSearch);

  useEffect(() => subscribeToLocationChanges(() => setSearch(getHashSearch())), []);

  // Memoising on the raw query string keeps the identity stable when a location
  // change leaves the query untouched, as react-router's useMemo on
  // location.search did.
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

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
