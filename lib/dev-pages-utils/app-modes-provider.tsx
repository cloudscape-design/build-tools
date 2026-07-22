// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ApplyAppModes,
  AppContextType,
  appModesDefaults,
  AppUrlParams,
  parseAppModes,
  updateAppModes,
} from "./app-modes.js";

const AppModesContext = createContext<AppContextType>({
  urlParams: appModesDefaults,
  setUrlParams: () => {},
});

export function AppModesProvider({ children, applyModes }: { children: ReactNode; applyModes?: ApplyAppModes }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlParams = useMemo(() => parseAppModes(searchParams), [searchParams]);

  const setUrlParams = useCallback(
    (newParams: Partial<AppUrlParams>) => updateAppModes(urlParams, newParams, setSearchParams),
    [urlParams, setSearchParams],
  );

  useEffect(() => {
    document.documentElement.setAttribute("dir", urlParams.direction);
    applyModes?.(urlParams);
  }, [urlParams, applyModes]);

  const value = useMemo<AppContextType>(() => ({ urlParams, setUrlParams }), [urlParams, setUrlParams]);

  return <AppModesContext.Provider value={value}>{children}</AppModesContext.Provider>;
}

// Pass a type argument for package-specific params, e.g. useAppModes<{ myFlag: boolean }>().
export function useAppModes<T = unknown>(): AppContextType<T> {
  return useContext(AppModesContext) as AppContextType<T>;
}
