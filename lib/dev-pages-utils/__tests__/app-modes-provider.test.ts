// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test, vi } from "vitest";

import { parseAppModes } from "../app-modes";
import { getHashSearchParams, setHashSearchParams, subscribeToLocationChanges } from "../app-modes-provider";

function stubWindow({ hash, pathname = "/", search = "" }: { hash: string; pathname?: string; search?: string }) {
  const pushState = vi.fn();
  const replaceState = vi.fn();
  const listeners: Record<string, Array<() => void>> = {};
  const addEventListener = vi.fn((type: string, fn: () => void) => {
    (listeners[type] = listeners[type] ?? []).push(fn);
  });
  const removeEventListener = vi.fn((type: string, fn: () => void) => {
    listeners[type] = (listeners[type] ?? []).filter(l => l !== fn);
  });
  vi.stubGlobal("window", {
    location: { hash, pathname, search },
    history: { pushState, replaceState },
    addEventListener,
    removeEventListener,
  });
  return { pushState, replaceState, listeners };
}

const writtenUrl = (pushState: ReturnType<typeof vi.fn>) => pushState.mock.calls[0][2];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHashSearchParams", () => {
  test("reads the query string that follows the hash path", () => {
    stubWindow({ hash: "#/some/path?mode=dark&density=compact" });
    const params = getHashSearchParams();
    expect(params.get("mode")).toBe("dark");
    expect(params.get("density")).toBe("compact");
  });

  test("returns no params when the hash has no query string", () => {
    stubWindow({ hash: "#/some/path" });
    expect(getHashSearchParams().toString()).toBe("");
  });

  test("returns no params when the hash is empty", () => {
    stubWindow({ hash: "" });
    expect(getHashSearchParams().toString()).toBe("");
  });

  test("returns no params for a bare question mark", () => {
    stubWindow({ hash: "#/page?" });
    expect(getHashSearchParams().toString()).toBe("");
  });

  test("keeps params whose value is empty", () => {
    stubWindow({ hash: "#/page?theme=&mode=dark" });
    const params = getHashSearchParams();
    expect(params.get("theme")).toBe("");
    expect(params.get("mode")).toBe("dark");
  });

  test("decodes percent-encoded values", () => {
    stubWindow({ hash: "#/page?label=a%20b%26c%3Dd" });
    expect(getHashSearchParams().get("label")).toBe("a b&c=d");
  });

  test("decodes + as a space, as URLSearchParams does", () => {
    stubWindow({ hash: "#/page?label=a+b" });
    expect(getHashSearchParams().get("label")).toBe("a b");
  });

  test("keeps every occurrence of a repeated param", () => {
    stubWindow({ hash: "#/page?mode=light&mode=dark" });
    expect(getHashSearchParams().getAll("mode")).toEqual(["light", "dark"]);
  });

  test("feeds parseAppModes so the last occurrence of a repeated param wins", () => {
    stubWindow({ hash: "#/page?mode=light&mode=dark" });
    expect(parseAppModes(getHashSearchParams()).mode).toBe("dark");
  });

  test("feeds parseAppModes so absent params fall back to defaults", () => {
    stubWindow({ hash: "#/page?mode=dark" });
    const appModes = parseAppModes(getHashSearchParams());
    expect(appModes.mode).toBe("dark");
    expect(appModes.density).toBe("comfortable");
    expect(appModes.motionDisabled).toBe(false);
  });
});

describe("setHashSearchParams", () => {
  test("writes the params after the hash path, preserving their order", () => {
    const { pushState } = stubWindow({ hash: "#/my/page" });
    setHashSearchParams({ mode: "dark", density: "compact" });
    expect(writtenUrl(pushState)).toBe("/#/my/page?mode=dark&density=compact");
  });

  test("pushes a history entry rather than replacing, as setSearchParams did", () => {
    const { pushState, replaceState } = stubWindow({ hash: "#/my/page" });
    setHashSearchParams({ mode: "dark" });
    expect(pushState).toHaveBeenCalledOnce();
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("replaces pre-existing params instead of merging them", () => {
    const { pushState } = stubWindow({ hash: "#/my/page?old=param" });
    setHashSearchParams({ mode: "dark" });
    expect(writtenUrl(pushState)).toBe("/#/my/page?mode=dark");
  });

  test("omits the question mark when there are no params", () => {
    const { pushState } = stubWindow({ hash: "#/page?old=value" });
    setHashSearchParams({});
    expect(writtenUrl(pushState)).toBe("/#/page");
  });

  test("preserves the pathname and search of the surrounding URL", () => {
    const { pushState } = stubWindow({ hash: "#/page", pathname: "/sub/dir/", search: "?outer=1" });
    setHashSearchParams({ mode: "dark" });
    expect(writtenUrl(pushState)).toBe("/sub/dir/?outer=1#/page?mode=dark");
  });

  test("encodes spaces as + so the URL matches URLSearchParams", () => {
    const { pushState } = stubWindow({ hash: "#/page" });
    setHashSearchParams({ label: "a b&c=d" });
    expect(writtenUrl(pushState)).toBe("/#/page?label=a+b%26c%3Dd");
  });

  test("encodes values so that they survive a write/read round trip", () => {
    const { pushState } = stubWindow({ hash: "#/page" });
    setHashSearchParams({ label: "a b&c=d", unicode: "äöü", empty: "" });

    const url = writtenUrl(pushState) as string;
    stubWindow({ hash: url.slice(url.indexOf("#")) });
    const params = getHashSearchParams();

    expect(params.get("label")).toBe("a b&c=d");
    expect(params.get("unicode")).toBe("äöü");
    expect(params.get("empty")).toBe("");
  });
});

describe("subscribeToLocationChanges", () => {
  test("notifies on hashchange and popstate", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const onChange = vi.fn();
    subscribeToLocationChanges(onChange);

    listeners.hashchange.forEach(l => l());
    expect(onChange).toHaveBeenCalledTimes(1);
    listeners.popstate.forEach(l => l());
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test("notifies when a router navigates with pushState, which fires no event", () => {
    stubWindow({ hash: "#/page" });
    const onChange = vi.fn();
    subscribeToLocationChanges(onChange);

    window.history.pushState(null, "", "/#/other?mode=dark");
    expect(onChange).toHaveBeenCalledOnce();
  });

  test("notifies when a router navigates with replaceState", () => {
    stubWindow({ hash: "#/page" });
    const onChange = vi.fn();
    subscribeToLocationChanges(onChange);

    window.history.replaceState(null, "", "/#/other?mode=dark");
    expect(onChange).toHaveBeenCalledOnce();
  });

  test("still performs the underlying history call it wraps", () => {
    const { pushState } = stubWindow({ hash: "#/page" });
    subscribeToLocationChanges(vi.fn());

    window.history.pushState(null, "", "/#/other");
    expect(pushState).toHaveBeenCalledWith(null, "", "/#/other");
  });

  test("restores the original history methods and removes listeners on cleanup", () => {
    const { pushState, listeners } = stubWindow({ hash: "#/page" });
    const onChange = vi.fn();

    const unsubscribe = subscribeToLocationChanges(onChange);
    unsubscribe();

    expect(window.history.pushState).toBe(pushState);
    expect(listeners.hashchange).toEqual([]);
    expect(listeners.popstate).toEqual([]);

    window.history.pushState(null, "", "/#/other");
    expect(onChange).not.toHaveBeenCalled();
  });
});
