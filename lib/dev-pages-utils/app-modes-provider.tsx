// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { AppContextType, appModesDefaults, applyAppModes, AppUrlParams, parseAppModes, updateAppModes } from "./app-modes.js";

const AppModesContext = createContext<AppContextType>({
  urlParams: appModesDefaults,
  setUrlParams: () => {},
});

export function AppModesProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Depend on the whole object (memoized on the query) rather than enumerating params, so params
  // added to parseAppModes/applyAppModes re-apply without touching this file or its consumers.
  const urlParams = useMemo(() => parseAppModes(searchParams), [searchParams]);

  const setUrlParams = useCallback(
    (newParams: Partial<AppUrlParams>) => updateAppModes(urlParams, newParams, setSearchParams),
    [urlParams, setSearchParams]
  );

  useEffect(() => {
    applyAppModes(urlParams);
  }, [urlParams]);

  const value = useMemo<AppContextType>(() => ({ urlParams, setUrlParams }), [urlParams, setUrlParams]);

  return <AppModesContext.Provider value={value}>{children}</AppModesContext.Provider>;
}

// Pass a type argument for package-specific params, e.g. useAppModes<{ myFlag: boolean }>().
export function useAppModes<T = unknown>(): AppContextType<T> {
  return useContext(AppModesContext) as AppContextType<T>;
}
