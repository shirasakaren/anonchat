import { describe, expect, it } from "vitest";
import { detectTextLanguage, isCsv } from "./textFileTypes.js";

describe("detectTextLanguage", () => {
  it("maps known extensions to their language id", () => {
    expect(detectTextLanguage("application/octet-stream", "notes.ts")).toBe("typescript");
    expect(detectTextLanguage("application/octet-stream", "config.yaml")).toBe("yaml");
    expect(detectTextLanguage("application/octet-stream", "script.py")).toBe("python");
  });

  it("prefers extension over a generic mimetype", () => {
    expect(detectTextLanguage("text/plain", "server.js")).toBe("javascript");
  });

  it("falls back to plaintext for a generic text/* mimetype with an unknown extension", () => {
    expect(detectTextLanguage("text/plain", "readme.xyz")).toBe("plaintext");
  });

  it("does not treat csv as a generic text preview - it has its own component", () => {
    expect(detectTextLanguage("text/csv", "data.csv")).toBeNull();
  });

  it("returns null for binary/unrecognized types", () => {
    expect(detectTextLanguage("image/png", "photo.png")).toBeNull();
    expect(detectTextLanguage("application/octet-stream", "archive.zip")).toBeNull();
  });

  it("recognizes common application/* text-like mimetypes even with no extension", () => {
    expect(detectTextLanguage("application/json", "blob")).toBe("plaintext");
  });
});

describe("isCsv", () => {
  it("recognizes the standard text/csv mimetype", () => {
    expect(isCsv("text/csv", "anything")).toBe(true);
  });

  it("recognizes a .csv extension even under a generic mimetype", () => {
    expect(isCsv("application/vnd.ms-excel", "export.csv")).toBe(true);
  });

  it("rejects non-csv files", () => {
    expect(isCsv("text/plain", "notes.txt")).toBe(false);
  });
});
