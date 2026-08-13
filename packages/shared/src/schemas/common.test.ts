import { describe, expect, it } from "vitest";
import { MAX_CIPHERTEXT_ENVELOPE_BYTES } from "../constants.js";
import { EncryptedPayloadSchema, PaginationQuerySchema, PublicIdSchema } from "./common.js";

describe("PublicIdSchema", () => {
  it("accepts a well-formed public id", () => {
    expect(PublicIdSchema.safeParse("ABCD-1234-EF56").success).toBe(true);
  });

  it.each(["abcd-1234-ef56", "ABCD-1234", "ABCD-1234-EF5", "ABCD1234EF56", ""])(
    "rejects malformed input: %s",
    (input) => {
      expect(PublicIdSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("EncryptedPayloadSchema", () => {
  it("accepts a well-formed ciphertext/nonce pair", () => {
    const result = EncryptedPayloadSchema.safeParse({ nonce: "abc123_-", ciphertext: "def456_-" });
    expect(result.success).toBe(true);
  });

  it.each([
    { nonce: "has spaces", ciphertext: "abc" },
    { nonce: "abc", ciphertext: "has+slash/" },
    { nonce: "", ciphertext: "abc" },
  ])("rejects invalid base64url content: %o", (input) => {
    expect(EncryptedPayloadSchema.safeParse(input).success).toBe(false);
  });

  it("accepts a ciphertext right up to the configured ceiling", () => {
    const atLimit = { nonce: "abc", ciphertext: "a".repeat(MAX_CIPHERTEXT_ENVELOPE_BYTES) };
    expect(EncryptedPayloadSchema.safeParse(atLimit).success).toBe(true);
  });

  it("rejects a ciphertext over the configured ceiling (DoS guard)", () => {
    const overLimit = { nonce: "abc", ciphertext: "a".repeat(MAX_CIPHERTEXT_ENVELOPE_BYTES + 1) };
    expect(EncryptedPayloadSchema.safeParse(overLimit).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(EncryptedPayloadSchema.safeParse({ nonce: "abc" }).success).toBe(false);
    expect(EncryptedPayloadSchema.safeParse({}).success).toBe(false);
  });
});

describe("PaginationQuerySchema", () => {
  it("accepts an empty query with all defaults", () => {
    const result = PaginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("coerces a string limit to a number", () => {
    const result = PaginationQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(50);
  });

  it("rejects a limit above the max", () => {
    expect(PaginationQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it("rejects a limit below 1", () => {
    expect(PaginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
