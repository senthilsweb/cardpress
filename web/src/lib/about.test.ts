import { describe, expect, it } from "vitest";
import { aboutParts, aboutText } from "./about";

describe("about", () => {
  const info = {
    name: "cardpress", version: "main", db: "sqlite", authRequired: true,
    build: { commit: "6ce55499e58789b1", date: "2026-11-27T04:52:53Z" },
    agent: { name: "Claude agent", ai: true, ready: true, version: "8", schemaVersion: 4 },
  };

  it("shows the server, its build and its assistant", () => {
    expect(aboutText(aboutParts(info))).toBe(
      "CardPress\n  Version: main\n  Build: 6ce5549 · 2026-11-27\n  Database: SQLite\nAssistant\n  Status: Connected\n  Name: Claude agent\n  Agent version: 8\n  Content schema: 4",
    );
  });

  it("leaves out what the server did not say", () => {
    const text = aboutText(aboutParts({ name: "cardpress", version: "dev", db: "sqlite", authRequired: false, agent: { name: "None", ai: false, ready: false } }));
    expect(text).not.toContain("Build");
    expect(text).toContain("Status: Not set up");
    expect(text).not.toContain("Agent version");
  });
});
