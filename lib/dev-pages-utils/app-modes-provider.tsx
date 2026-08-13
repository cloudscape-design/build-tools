// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
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
export function getHashSearch(): string {
  // `location.hash` is everything from the first "#" onwards, so the leading "#"
  // and any nested fragment are dropped before looking for the query, matching
  // how react-router parsed a hash location.
  const [hashPath] = window.location.hash.slice(1).split("#");
  const queryStart = hashPath.indexOf("?");
  return queryStart === -1 ? "" : hashPath.slice(queryStart + 1);
}

// Subscribers to same-document location changes. `pushState` fires no DOM event,
// so writes made through `setHashSearchParams` notify this set directly instead.
const locationListeners = new Set<() => void>();

/**
 * Notifies on every same-document location change this module can observe:
 * browser-driven navigation, which fires `hashchange` or `popstate`, and writes
 * made through `setHashSearchParams`. Returns an unsubscribe function.
 *
 * Subscribers are held by identity, so unsubscribing is exact and independent of
 * the order in which subscribers tear down.
 */
export function subscribeToLocationChanges(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  locationListeners.add(onChange);

  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    locationListeners.delete(onChange);
  };
}

/**
 * Writes a new set of query params into the hash, preserving the path portion,
 * e.g. `/#/some/path` + `{ mode: "dark" }` → `/#/some/path?mode=dark`. Pushes a
 * history entry, as react-router's setSearchParams did.
 */
export function setHashSearchParams(params: Record<string, string>): void {
  const [hashPath] = window.location.hash.split("?");
  // URLSearchParams keeps insertion order and encodes spaces as "+", which is
  // what react-router serialised search params with.
  const search = new URLSearchParams(params).toString();
  const newHash = search ? `${hashPath}?${search}` : hashPath;
  const { pathname, search: outerSearch } = window.location;

  // The existing history state is carried over rather than overwritten: only the
  // query string is ours to change, and the state belongs to whichever router
  // the consumer rendered this provider in.
  window.history.pushState(window.history.state, "", `${pathname}${outerSearch}${newHash}`);

  // Snapshotted so one dispatch notifies exactly the subscribers that were
  // registered when it started, even if one of them subscribes or unsubscribes
  // while being notified.
  for (const notify of [...locationListeners]) {
    notify();
  }
}

/**
 * Drop-in replacement for react-router-dom's useSearchParams, scoped to the
 * hash query string. Does not require a Router context.
 */
function useHashSearchParams(): [URLSearchParams, (params: Record<string, string>) => void] {
  const [search, setSearch] = useState<string>(getHashSearch);

  useEffect(() => {
    const readSearch = () => setSearch(getHashSearch());
    const unsubscribe = subscribeToLocationChanges(readSearch);
    // The location may have changed between the render that seeded the state and
    // this subscription taking effect, so it is re-read once here.
    readSearch();
    return unsubscribe;
  }, []);

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
