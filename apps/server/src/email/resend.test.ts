import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: sendMock } };
  }),
}));

const { ResendEmailAdapter } = await import("./resend.js");

describe("ResendEmailAdapter", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("sends with the configured from address", async () => {
    sendMock.mockResolvedValue({ data: { id: "abc" }, error: null });
    const adapter = new ResendEmailAdapter("re_test_key", "site@example.com");
    await adapter.send({ to: "visitor@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(sendMock).toHaveBeenCalledWith({
      from: "site@example.com",
      to: "visitor@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  it("throws when Resend reports an error, so callers' error handling actually engages", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "invalid API key" } });
    const adapter = new ResendEmailAdapter("bad_key", "site@example.com");
    await expect(adapter.send({ to: "a@b.com", subject: "s", html: "h", text: "t" })).rejects.toThrow(
      "invalid API key",
    );
  });
});
