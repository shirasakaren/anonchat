import { describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn().mockResolvedValue({});
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
vi.mock("nodemailer", () => ({ default: { createTransport: createTransportMock } }));

const { SmtpEmailAdapter } = await import("./smtp.js");

describe("SmtpEmailAdapter", () => {
  it("configures the transport from the given config", () => {
    new SmtpEmailAdapter({ host: "smtp.example.com", port: 587, secure: false, from: "site@example.com" });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false, auth: undefined }),
    );
  });

  it("passes auth through when user/password are set", () => {
    new SmtpEmailAdapter({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "u",
      password: "p",
      from: "site@example.com",
    });
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: "u", pass: "p" } }));
  });

  it("sends with the configured from address", async () => {
    const adapter = new SmtpEmailAdapter({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      from: "site@example.com",
    });
    await adapter.send({ to: "visitor@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "site@example.com",
      to: "visitor@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
  });
});
