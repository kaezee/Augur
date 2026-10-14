/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import changelog from "../CHANGELOG.md?raw";
import { AUGUR_VERSION } from "../augur/version";

describe("AUGUR_VERSION", () => {
  it("matches the newest version heading in CHANGELOG.md", () => {
    expect(changelog.match(/^## (\d+\.\d+\.\d+)/m)?.[1]).toBe(AUGUR_VERSION);
  });
});
