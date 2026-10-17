/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import registry from "../registry.json";

// Every module file ships in the shadcn item, so an install is the whole folder.
const moduleFiles = Object.keys(import.meta.glob("../augur/**/*.{ts,tsx}"))
  .filter((p) => !p.includes(".test."))
  .map((p) => p.replace("../", ""))
  .sort();

describe("registry.json", () => {
  it("lists exactly the module's files, each installed at the same path", () => {
    const files = registry.items[0].files;
    expect(files.map((f) => f.path).sort()).toEqual(moduleFiles);
    for (const f of files) expect(f.target).toBe(f.path);
  });
});
