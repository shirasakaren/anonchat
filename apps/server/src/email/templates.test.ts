import { describe, expect, it } from "vitest";
import { adminDigestEmail, replyNotificationEmail } from "./templates.js";

describe("replyNotificationEmail", () => {
  it("never includes message content - only generic reply metadata", () => {
    const { html, text, subject } = replyNotificationEmail({ adminName: "Ren", siteUrl: "https://example.com" });
    expect(subject).toBe("New reply from Ren");
    expect(html).toContain("Ren");
    expect(html).toContain("https://example.com");
    expect(html).toContain("end-to-end encrypted");
    expect(text).toContain("Ren");
  });

  it("escapes HTML in the admin display name (untrusted, admin-set)", () => {
    const { html } = replyNotificationEmail({ adminName: "<script>alert(1)</script>", siteUrl: "https://example.com" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("adminDigestEmail", () => {
  it("pluralizes correctly for exactly one message/conversation", () => {
    const { subject, text } = adminDigestEmail({
      messageCount: 1,
      conversationCount: 1,
      siteUrl: "https://example.com",
    });
    expect(subject).toBe("1 new message on https://example.com");
    expect(text).toContain("1 new message across 1 conversation");
  });

  it("pluralizes correctly for multiple messages/conversations", () => {
    const { subject, text } = adminDigestEmail({
      messageCount: 5,
      conversationCount: 3,
      siteUrl: "https://example.com",
    });
    expect(subject).toBe("5 new messages on https://example.com");
    expect(text).toContain("5 new messages across 3 conversations");
  });

  it("links to /admin, not the bare site root", () => {
    const { text } = adminDigestEmail({ messageCount: 2, conversationCount: 1, siteUrl: "https://example.com" });
    expect(text).toContain("https://example.com/admin");
  });

  it("never includes message content", () => {
    const { html } = adminDigestEmail({ messageCount: 2, conversationCount: 1, siteUrl: "https://example.com" });
    expect(html).toContain("end-to-end encrypted");
  });
});
