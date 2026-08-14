import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("undici", () => ({ fetch: fetchMock }));

const { fetchGravatarAvatarDataUrl } = await import("./gravatar.js");

function mockResponse(init: { ok: boolean; contentType?: string; body?: Uint8Array }) {
  return {
    ok: init.ok,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? (init.contentType ?? null) : null) },
    body: init.body
      ? {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: init.body };
              },
              cancel: async () => {},
            };
          },
        }
      : undefined,
  };
}

describe("fetchGravatarAvatarDataUrl", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("hashes the trimmed, lowercased email into the request URL (Gravatar's documented SHA256 form)", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false }));
    await fetchGravatarAvatarDataUrl("  Some.Email@Example.COM  ");
    const requestedUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    // Independently computed: sha256("some.email@example.com")
    expect(requestedUrl.pathname).toBe("/avatar/0656b9edb6847bf1b67ed58cc2f46cd146039cc7a611f24e215aa23e8a161908");
    expect(requestedUrl.searchParams.get("d")).toBe("404");
  });

  it("returns null when Gravatar responds 404 (no image for this email)", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false }));
    expect(await fetchGravatarAvatarDataUrl("nobody@example.com")).toBeNull();
  });

  it("returns null for a disallowed content-type", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true, contentType: "text/html", body: new Uint8Array([1, 2, 3]) }));
    expect(await fetchGravatarAvatarDataUrl("someone@example.com")).toBeNull();
  });

  it("returns a correctly-formed data URL for a valid image response", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    fetchMock.mockResolvedValue(mockResponse({ ok: true, contentType: "image/png", body: bytes }));
    const result = await fetchGravatarAvatarDataUrl("someone@example.com");
    expect(result).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
  });

  it("rejects a response whose bytes don't match its claimed content-type (header is just a claim)", async () => {
    // Content-Type says PNG, but the bytes are plain text - a mislabeled or
    // spoofed response shouldn't get stored as this site's avatarUrl.
    const bytes = new TextEncoder().encode("not actually an image");
    fetchMock.mockResolvedValue(mockResponse({ ok: true, contentType: "image/png", body: bytes }));
    expect(await fetchGravatarAvatarDataUrl("someone@example.com")).toBeNull();
  });

  it("returns null when fetch itself throws (network error, timeout)", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    expect(await fetchGravatarAvatarDataUrl("someone@example.com")).toBeNull();
  });
});
