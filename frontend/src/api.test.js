import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./api";

function mockFetch(status, body) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

describe("api()", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("sends the token and workspace headers", async () => {
    localStorage.setItem("token", "abc123");
    const fetchMock = mockFetch(200, { results: [] });
    vi.stubGlobal("fetch", fetchMock);

    await api("/projects/", { workspace: "acme" });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/");
    expect(opts.headers.Authorization).toBe("Token abc123");
    expect(opts.headers["X-Workspace"]).toBe("acme");
  });

  it("serializes the body as JSON for POST", async () => {
    const fetchMock = mockFetch(201, { id: 1 });
    vi.stubGlobal("fetch", fetchMock);

    await api("/projects/", { method: "POST", body: { name: "Web", key: "WEB" } });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Web", key: "WEB" });
  });

  it("surfaces the server's detail message as an Error", async () => {
    vi.stubGlobal("fetch", mockFetch(402, { detail: "Plan limit reached." }));
    await expect(api("/projects/", { method: "POST" })).rejects.toThrow("Plan limit reached.");
  });

  it("joins field-level validation errors", async () => {
    vi.stubGlobal("fetch", mockFetch(400, { name: ["Required."], key: ["Too long."] }));
    await expect(api("/projects/")).rejects.toThrow("Required. Too long.");
  });

  it("returns null for 204 responses", async () => {
    vi.stubGlobal("fetch", mockFetch(204, null));
    await expect(api("/auth/logout/", { method: "POST" })).resolves.toBeNull();
  });
});
