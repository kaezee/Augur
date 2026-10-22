import { describe, it, expect } from "vitest";
import { cleanMessage, maskSecrets, normalizeError, stripUrl } from "./context";

describe("diagnostic context limits", () => {
  it("strips query strings and fragments", () => {
    expect(stripUrl("/w/42/chapters?token=abc&email=a@b.c#frag")).toBe("/w/42/chapters");
    expect(stripUrl("https://app.example.com/assets/app.js?v=3#x")).toBe("https://app.example.com/assets/app.js");
  });

  it("keeps the first line of a message, cut to 120 characters", () => {
    expect(cleanMessage("TypeError: x is undefined\n    at foo (app.js:1:2)")).toBe("TypeError: x is undefined");
    expect(cleanMessage("a".repeat(300))).toHaveLength(120);
  });

  it("normalizes an error to type, source (no query), line and message", () => {
    expect(normalizeError({ name: "TypeError", filename: "https://app.example.com/app.js?v=9", lineno: 12, message: "boom\nmore" }))
      .toEqual({ type: "TypeError", source: "https://app.example.com/app.js", line: 12, message: "boom" });
  });

  it("reads source and line from a stack when there's no filename", () => {
    const e = normalizeError({ name: "Error", message: "nope", stack: "Error: nope\n    at x (https://app.example.com/main.js?h=1:88:5)" });
    expect(e).toEqual({ type: "Error", source: "https://app.example.com/main.js", line: 88, message: "nope" });
  });

  it("drops browser-extension errors and host-listed sources", () => {
    for (const src of ["chrome-extension://abc/x.js", "moz-extension://abc/x.js", "safari-extension://abc/x.js"]) {
      expect(normalizeError({ filename: src, message: "x" })).toBeNull();
    }
    expect(normalizeError({ filename: "https://cloud.umami.is/script.js", message: "x" }, ["https://cloud.umami.is"])).toBeNull();
    expect(normalizeError({ filename: "https://app.example.com/a.js", message: "x" }, ["https://cloud.umami.is"])).not.toBeNull();
  });
});

describe("masking secrets in error messages", () => {
  it("masks emails, JWTs, auth headers, key-like strings and long numbers", () => {
    expect(maskSecrets("Failed to load profile for jane.doe+test@example.co.uk")).toBe("Failed to load profile for [redacted]");
    expect(maskSecrets("Invalid token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc_DEF-123")).toBe("Invalid token [redacted]");
    expect(maskSecrets("401 for Bearer abc.def123")).toBe("401 for [redacted]");
    expect(maskSecrets("bad key k9F2mQ7xL4pR8tZ1vB6nW3yH5j")).toBe("bad key [redacted]");
    expect(maskSecrets("card 4242424242424242 declined")).toBe("card [redacted] declined");
  });

  it("leaves ordinary messages alone", () => {
    for (const m of ["Cannot read properties of undefined (reading 'members')", "Failed to fetch", "Request failed with status code 500", "Minified React error #418"])
      expect(maskSecrets(m)).toBe(m);
  });

  it("masks before cutting to 120 characters, so a token at the cut is still caught", () => {
    const m = "x".repeat(105) + " eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig";
    expect(cleanMessage(m)).toBe("x".repeat(105) + " [redacted]");
  });

  it("applies the host's redactError first, and falls back if it throws", () => {
    expect(cleanMessage("order ORD-77 failed for jane@x.io", (s) => s.replace(/ORD-\d+/g, "[order]"))).toBe("order [order] failed for [redacted]");
    expect(cleanMessage("for jane@x.io", () => { throw new Error("oops"); })).toBe("for [redacted]");
    expect(normalizeError({ name: "Error", message: "acct 12 jane@x.io" }, [], (s) => s.replace("acct 12", "acct ?"))?.message).toBe("acct ? [redacted]");
  });
});
