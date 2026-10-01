import { describe, it, expect } from "vitest";
import { cleanMessage, normalizeError, stripUrl } from "./context";

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
