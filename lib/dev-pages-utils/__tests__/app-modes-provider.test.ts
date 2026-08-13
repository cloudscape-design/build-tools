// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test, vi } from "vitest";

import { parseAppModes } from "../app-modes";
import { getHashSearch, setHashSearchParams, subscribeToLocationChanges } from "../app-modes-provider";

function stubWindow({
  hash,
  pathname = "/",
  search = "",
  state = null,
}: {
  hash: string;
  pathname?: string;
  search?: string;
  state?: unknown;
}) {
  const pushState = vi.fn();
  const replaceState = vi.fn();
  const listeners: Record<string, Array<() => void>> = {};
  const addEventListener = vi.fn((type: string, fn: () => void) => {
    (listeners[type] = listeners[type] ?? []).push(fn);
  });
  const removeEventListener = vi.fn((type: string, fn: () => void) => {
    listeners[type] = (listeners[type] ?? []).filter(l => l !== fn);
  });
  const history = { pushState, replaceState, state };
  vi.stubGlobal("window", {
    location: { hash, pathname, search },
    history,
    addEventListener,
    removeEventListener,
  });
  return { pushState, replaceState, listeners, history };
}

const hashParams = () => new URLSearchParams(getHashSearch());
const writtenUrl = (pushState: ReturnType<typeof vi.fn>) => pushState.mock.calls[0][2];

// Subscribers live in a module-level registry, so every subscription a test opens
// is closed again here to keep the tests independent of one another.
const openSubscriptions: Array<() => void> = [];
function subscribe(onChange: () => void) {
  const unsubscribe = subscribeToLocationChanges(onChange);
  openSubscriptions.push(unsubscribe);
  return unsubscribe;
}

afterEach(() => {
  while (openSubscriptions.length > 0) {
    openSubscriptions.pop()!();
  }
  vi.unstubAllGlobals();
});

describe("getHashSearch", () => {
  test("reads the query string that follows the hash path", () => {
    stubWindow({ hash: "#/some/path?mode=dark&density=compact" });
    const params = hashParams();
    expect(params.get("mode")).toBe("dark");
    expect(params.get("density")).toBe("compact");
  });

  test("returns no params when the hash has no query string", () => {
    stubWindow({ hash: "#/some/path" });
    expect(hashParams().toString()).toBe("");
  });

  test("returns no params when the hash is empty", () => {
    stubWindow({ hash: "" });
    expect(hashParams().toString()).toBe("");
  });

  test("returns no params for a bare question mark", () => {
    stubWindow({ hash: "#/page?" });
    expect(hashParams().toString()).toBe("");
  });

  test("keeps params whose value is empty", () => {
    stubWindow({ hash: "#/page?theme=&mode=dark" });
    const params = hashParams();
    expect(params.get("theme")).toBe("");
    expect(params.get("mode")).toBe("dark");
  });

  test("decodes percent-encoded values", () => {
    stubWindow({ hash: "#/page?label=a%20b%26c%3Dd" });
    expect(hashParams().get("label")).toBe("a b&c=d");
  });

  test("decodes + as a space, as URLSearchParams does", () => {
    stubWindow({ hash: "#/page?label=a+b" });
    expect(hashParams().get("label")).toBe("a b");
  });

  test("keeps every occurrence of a repeated param", () => {
    stubWindow({ hash: "#/page?mode=light&mode=dark" });
    expect(hashParams().getAll("mode")).toEqual(["light", "dark"]);
  });

  test("stops at a nested fragment, as react-router's hash parsing did", () => {
    stubWindow({ hash: "#/page?mode=dark#section" });
    expect(getHashSearch()).toBe("mode=dark");
  });

  test("returns no params when only a nested fragment follows the path", () => {
    stubWindow({ hash: "#/page#section" });
    expect(getHashSearch()).toBe("");
  });

  test("feeds parseAppModes so the last occurrence of a repeated param wins", () => {
    stubWindow({ hash: "#/page?mode=light&mode=dark" });
    expect(parseAppModes(hashParams()).mode).toBe("dark");
  });

  test("feeds parseAppModes so absent params fall back to defaults", () => {
    stubWindow({ hash: "#/page?mode=dark" });
    const appModes = parseAppModes(hashParams());
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

  test("carries the existing history state over instead of overwriting it", () => {
    const routerState = { idx: 4, key: "abc123" };
    const { pushState } = stubWindow({ hash: "#/page", state: routerState });
    setHashSearchParams({ mode: "dark" });
    expect(pushState.mock.calls[0][0]).toBe(routerState);
  });

  test("encodes values so that they survive a write/read round trip", () => {
    const { pushState } = stubWindow({ hash: "#/page" });
    setHashSearchParams({ label: "a b&c=d", unicode: "äöü", empty: "" });

    const url = writtenUrl(pushState) as string;
    stubWindow({ hash: url.slice(url.indexOf("#")) });
    const params = hashParams();

    expect(params.get("label")).toBe("a b&c=d");
    expect(params.get("unicode")).toBe("äöü");
    expect(params.get("empty")).toBe("");
  });
});

describe("subscribeToLocationChanges", () => {
  test("notifies on hashchange and popstate", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const onChange = vi.fn();
    subscribe(onChange);

    listeners.hashchange.forEach(l => l());
    expect(onChange).toHaveBeenCalledTimes(1);
    listeners.popstate.forEach(l => l());
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test("notifies on a write, which fires no DOM event", () => {
    stubWindow({ hash: "#/page" });
    const onChange = vi.fn();
    subscribe(onChange);

    setHashSearchParams({ mode: "dark" });
    expect(onChange).toHaveBeenCalledOnce();
  });

  test("leaves the history API untouched", () => {
    const { history, pushState, replaceState } = stubWindow({ hash: "#/page" });
    const unsubscribe = subscribe(vi.fn());

    expect(history.pushState).toBe(pushState);
    expect(history.replaceState).toBe(replaceState);

    unsubscribe();

    expect(history.pushState).toBe(pushState);
    expect(history.replaceState).toBe(replaceState);
  });

  test("removes its DOM listeners on unsubscribe", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const onChange = vi.fn();

    subscribe(onChange)();

    expect(listeners.hashchange).toEqual([]);
    expect(listeners.popstate).toEqual([]);
  });

  test("stops notifying a subscriber once it has unsubscribed", () => {
    stubWindow({ hash: "#/page" });
    const onChange = vi.fn();

    subscribe(onChange)();
    setHashSearchParams({ mode: "dark" });

    expect(onChange).not.toHaveBeenCalled();
  });

  test("notifies every subscriber", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const first = vi.fn();
    const second = vi.fn();
    subscribe(first);
    subscribe(second);

    setHashSearchParams({ mode: "dark" });
    listeners.popstate.forEach(l => l());

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  test("keeps the remaining subscriber working when subscribers unsubscribe out of order", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(first);
    subscribe(second);

    // The first subscriber leaves while the second is still mounted, i.e. the
    // reverse of the order they subscribed in.
    unsubscribeFirst();
    setHashSearchParams({ mode: "dark" });
    listeners.popstate.forEach(l => l());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(2);
  });

  test("removes only the unsubscribing subscriber's DOM listeners", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const second = vi.fn();
    const unsubscribeFirst = subscribe(vi.fn());
    subscribe(second);

    unsubscribeFirst();

    expect(listeners.hashchange).toEqual([second]);
    expect(listeners.popstate).toEqual([second]);
  });

  test("leaves nothing subscribed once every subscriber has unsubscribed", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(first);
    const unsubscribeSecond = subscribe(second);

    unsubscribeSecond();
    unsubscribeFirst();

    expect(listeners.hashchange).toEqual([]);
    expect(listeners.popstate).toEqual([]);

    setHashSearchParams({ mode: "dark" });

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  test("a write after every subscriber has gone still updates the URL without throwing", () => {
    const { pushState } = stubWindow({ hash: "#/page" });
    const onChange = vi.fn();

    subscribe(onChange)();

    expect(() => setHashSearchParams({ mode: "dark" })).not.toThrow();
    expect(writtenUrl(pushState)).toBe("/#/page?mode=dark");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("unsubscribing twice is harmless", () => {
    const { listeners } = stubWindow({ hash: "#/page" });
    const onChange = vi.fn();
    const unsubscribe = subscribe(onChange);

    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();

    expect(listeners.hashchange).toEqual([]);
    setHashSearchParams({ mode: "dark" });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("lets a subscriber unsubscribe while it is being notified", () => {
    stubWindow({ hash: "#/page" });
    const second = vi.fn();
    const first = vi.fn(() => unsubscribeFirst());
    const unsubscribeFirst = subscribe(first);
    subscribe(second);

    expect(() => setHashSearchParams({ mode: "dark" })).not.toThrow();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    setHashSearchParams({ mode: "light" });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });

  test("does not notify a subscriber that subscribed while subscribers were being notified", () => {
    stubWindow({ hash: "#/page" });
    const late = vi.fn();
    let lateHasSubscribed = false;
    const first = vi.fn(() => {
      if (!lateHasSubscribed) {
        lateHasSubscribed = true;
        subscribe(late);
      }
    });
    subscribe(first);

    // The late subscriber joined mid-notification, so it must not receive the
    // change it was not yet subscribed for.
    setHashSearchParams({ mode: "dark" });
    expect(first).toHaveBeenCalledOnce();
    expect(late).not.toHaveBeenCalled();

    setHashSearchParams({ mode: "light" });
    expect(late).toHaveBeenCalledOnce();
  });
});
