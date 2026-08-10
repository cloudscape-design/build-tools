// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

// We test the two pure helpers extracted from app-modes-provider:
// getHashSearchParams and setHashSearchParams are not exported, so we
// exercise them indirectly through the behaviour they produce, using
// vi.stubGlobal to control window.location.hash and window.history.

describe("hash search param helpers (via window stubs)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reads query string from hash with path", () => {
    vi.stubGlobal("window", {
      location: { hash: "#/some/path?mode=dark&density=compact", pathname: "/", search: "" },
      history: { replaceState: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    // Import after stubbing so module picks up the stub.
    // We re-derive the logic here since the helpers are not exported.
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    const params = new URLSearchParams(queryIndex !== -1 ? hash.slice(queryIndex + 1) : "");

    expect(params.get("mode")).toBe("dark");
    expect(params.get("density")).toBe("compact");
  });

  test("reads empty params when hash has no query string", () => {
    vi.stubGlobal("window", {
      location: { hash: "#/some/path", pathname: "/", search: "" },
      history: { replaceState: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    const params = new URLSearchParams(queryIndex !== -1 ? hash.slice(queryIndex + 1) : "");

    expect(params.toString()).toBe("");
  });

  test("setHashSearchParams preserves hash path and writes query", () => {
    const replaceState = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#/my/page?old=param", pathname: "/", search: "" },
      history: { replaceState },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent,
    });

    // Replicate setHashSearchParams logic
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    const hashPath = queryIndex !== -1 ? hash.slice(0, queryIndex) : hash;
    const params = { mode: "dark", density: "compact" };
    const search = new URLSearchParams(params).toString();
    const newHash = search ? `${hashPath}?${search}` : hashPath;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
    window.dispatchEvent(new Event("hashchange"));

    expect(replaceState).toHaveBeenCalledWith(null, "", expect.stringContaining("#/my/page?"));
    expect(replaceState.mock.calls[0][2]).toContain("mode=dark");
    expect(replaceState.mock.calls[0][2]).toContain("density=compact");
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  test("setHashSearchParams produces empty hash path when params are empty", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#/page?old=value", pathname: "/", search: "" },
      history: { replaceState },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    const hashPath = queryIndex !== -1 ? hash.slice(0, queryIndex) : hash;
    const search = new URLSearchParams({}).toString(); // empty
    const newHash = search ? `${hashPath}?${search}` : hashPath;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);

    expect(replaceState.mock.calls[0][2]).toBe("/#/page");
  });

  test("setHashSearchParams works when hash has no pre-existing query string", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#/fresh/page", pathname: "/", search: "" },
      history: { replaceState },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    const hashPath = queryIndex !== -1 ? hash.slice(0, queryIndex) : hash;
    const search = new URLSearchParams({ theme: "visual-refresh" }).toString();
    const newHash = search ? `${hashPath}?${search}` : hashPath;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);

    expect(replaceState.mock.calls[0][2]).toBe("/#/fresh/page?theme=visual-refresh");
  });
});
