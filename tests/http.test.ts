import { describe, it, expect, vi, afterEach } from "vitest";
import { getJson } from "../src/lib/http";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("getJson", () => {
  it("returns parsed JSON on a 200", async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ ok: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(getJson<{ ok: number }>("/x")).resolves.toEqual({ ok: 1 });
  });

  it("throws a friendly message on a network error", async () => {
    stubFetch(() => Promise.reject(new Error("boom")));
    await expect(getJson("/x")).rejects.toThrow(/network error/i);
  });

  it("throws with the status code on a non-OK response", async () => {
    stubFetch(() => new Response("<html>500</html>", { status: 500 }));
    await expect(getJson("/x")).rejects.toThrow(/500/);
  });

  it("throws on a 200 with an unparseable body", async () => {
    stubFetch(() =>
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(getJson("/x")).rejects.toThrow(/unexpected response/i);
  });
});
