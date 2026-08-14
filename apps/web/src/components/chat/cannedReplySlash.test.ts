import { describe, expect, it } from "vitest";
import type { CannedReplyDto } from "@anonchat/shared";
import { findActiveSlashQuery, searchCannedReplies } from "./cannedReplySlash.js";

function reply(title: string, body = `body of ${title}`): CannedReplyDto {
  return { id: title, title, body, createdAt: "", updatedAt: "" };
}

describe("findActiveSlashQuery", () => {
  it("matches a bare slash at the very start", () => {
    expect(findActiveSlashQuery("/")).toEqual({ query: "" });
  });

  it("matches a partial command at the start", () => {
    expect(findActiveSlashQuery("/wel")).toEqual({ query: "wel" });
  });

  it("is case-insensitive", () => {
    expect(findActiveSlashQuery("/WEL")).toEqual({ query: "wel" });
  });

  it("does not match once whitespace follows the command (command is 'done')", () => {
    expect(findActiveSlashQuery("/welcome ")).toBeNull();
  });

  it("does not match a slash that isn't the first character (e.g. a URL/path)", () => {
    expect(findActiveSlashQuery("see example.com/path")).toBeNull();
    expect(findActiveSlashQuery("look here /foo")).toBeNull();
  });

  it("does not match plain text with no slash", () => {
    expect(findActiveSlashQuery("hello")).toBeNull();
  });
});

describe("searchCannedReplies", () => {
  const replies = [reply("welcome"), reply("welcome-back"), reply("bye"), reply("about")];

  it("lists everything for an empty query", () => {
    expect(searchCannedReplies(replies, "").map((r) => r.title)).toEqual(["bye", "about", "welcome", "welcome-back"]);
  });

  it("filters by title prefix, case-insensitively", () => {
    expect(searchCannedReplies(replies, "wel").map((r) => r.title)).toEqual(["welcome", "welcome-back"]);
  });

  it("sorts shortest-title-first, then alphabetically", () => {
    const result = searchCannedReplies([reply("bbbb"), reply("aaa"), reply("cc")], "");
    expect(result.map((r) => r.title)).toEqual(["cc", "aaa", "bbbb"]);
  });

  it("respects the limit", () => {
    expect(searchCannedReplies(replies, "", 2)).toHaveLength(2);
  });

  it("returns nothing for a query that matches no title", () => {
    expect(searchCannedReplies(replies, "zzz")).toEqual([]);
  });
});
