import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("returns typed env for a valid source", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@host/db",
      NODE_ENV: "test",
    });
    expect(env.DATABASE_URL).toBe("postgres://user:pass@host/db");
    expect(env.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV to development when omitted", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://user:pass@host/db" });
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws a descriptive error when DATABASE_URL is missing", () => {
    expect(() => parseEnv({})).toThrowError(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL is not a valid URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "not-a-url" })).toThrowError(/DATABASE_URL/);
  });

  it("does not exit the process on invalid input", () => {
    // Regression guard: parseEnv must throw (catchable), never process.exit.
    expect(() => parseEnv({ DATABASE_URL: "" })).toThrow();
  });
});
