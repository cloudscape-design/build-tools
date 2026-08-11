// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test, vi } from "vitest";

import { parseAppModes } from "../app-modes";
import { getHashSearchParams, setHashSearchParams } from "../app-modes-provider";

function stubWindow({ hash, pathname = "/", search = "" }: { hash: string; pathname?: string; search?: string }) {
  const replaceState = vi.fn();
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    location: { hash, pathname, search },
    history: { replaceState },
    dispatchEvent,
  });
  // HashChangeEvent is a DOM global that does not exist in the node test environment.
  vi.stubGlobal("HashChangeEvent", class extends Event {});
  return { replaceState, dispatchEvent };
}

const writtenUrl = (replaceState: ReturnType<typeof vi.fn>) => replaceState.mock.calls[0][2];

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
    const { replaceState } = stubWindow({ hash: "#/my/page" });
    setHashSearchParams({ mode: "dark", density: "compact" });
    expect(writtenUrl(replaceState)).toBe("/#/my/page?mode=dark&density=compact");
  });

  test("replaces pre-existing params instead of merging them", () => {
    const { replaceState } = stubWindow({ hash: "#/my/page?old=param" });
    setHashSearchParams({ mode: "dark" });
    expect(writtenUrl(replaceState)).toBe("/#/my/page?mode=dark");
  });

  test("omits the question mark when there are no params", () => {
    const { replaceState } = stubWindow({ hash: "#/page?old=value" });
    setHashSearchParams({});
    expect(writtenUrl(replaceState)).toBe("/#/page");
  });

  test("preserves the pathname and search of the surrounding URL", () => {
    const { replaceState } = stubWindow({ hash: "#/page", pathname: "/sub/dir/", search: "?outer=1" });
    setHashSearchParams({ mode: "dark" });
    expect(writtenUrl(replaceState)).toBe("/sub/dir/?outer=1#/page?mode=dark");
  });

  test("notifies listeners with a hashchange event", () => {
    const { dispatchEvent } = stubWindow({ hash: "#/page" });
    setHashSearchParams({ mode: "dark" });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe("hashchange");
  });

  test("encodes values so that they survive a write/read round trip", () => {
    const { replaceState } = stubWindow({ hash: "#/page" });
    setHashSearchParams({ label: "a b&c=d", unicode: "äöü", empty: "" });

    // Feed the URL that was written back into the reader.
    const url = writtenUrl(replaceState) as string;
    stubWindow({ hash: url.slice(url.indexOf("#")) });
    const params = getHashSearchParams();

    expect(params.get("label")).toBe("a b&c=d");
    expect(params.get("unicode")).toBe("äöü");
    expect(params.get("empty")).toBe("");
  });
});
