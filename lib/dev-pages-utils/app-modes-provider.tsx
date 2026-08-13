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
export function getHashSearch(): string {
  // The leading "#" has to go first: extract() removes everything from the first
  // "#" internally, so passing the hash verbatim would always yield an empty
  // query and silently reset every app mode. Stripping it also lets extract()
  // handle a nested fragment such as `#/page?mode=dark#section`, and a "?" that
  // only appears inside that fragment, the way react-router's hash parsing did.
  return queryString.extract(window.location.hash.slice(1));
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
  // Serialised with URLSearchParams rather than queryString.stringify:
  // react-router wrote through createSearchParams, which *is* URLSearchParams,
  // so this keeps insertion order and encodes a space as "+" for a byte-identical
  // URL. query-string exposes no option for "+" (its encoder is
  // encodeURIComponent, which emits "%20"), and correcting that afterwards would
  // mean patching up its output. Reading stays on query-string, which owns the
  // "?"/"#" boundary rules in getHashSearch above.
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
  // location.search did. URLSearchParams is also what parseAppModes consumes, so
  // repeated params still resolve last-one-wins exactly as they did on mainline.
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
