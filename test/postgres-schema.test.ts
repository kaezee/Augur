/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import supabase from "../sql/schema.sql?raw";
import plain from "../sql/postgres.sql?raw";

// Every table, index and seed row, comments and blank lines stripped.
const statements = (sql: string) => sql
  .split("\n").map((l) => l.replace(/--.*$/, "").trimEnd()).filter(Boolean).join("\n")
  .split(";").map((s) => s.trim().replace(/\s+/g, " "))
  .filter((s) => /^(create table|create index|insert into augur_config)/.test(s));

describe("sql/postgres.sql", () => {
  it("has exactly the tables and indexes of sql/schema.sql", () => {
    expect(statements(plain)).toEqual(statements(supabase));
    expect(statements(plain).filter((s) => s.startsWith("create table"))).toHaveLength(5);
  });
});
