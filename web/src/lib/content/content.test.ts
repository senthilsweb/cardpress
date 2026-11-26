import { describe, expect, it } from "vitest";
import { CardText, Post, PostStandard, SCHEMA_VERSION } from "./content";
import schema from "./content.schema.json";
import built from "../../../../internal/content/content.schema.json";

describe("the copy of the content models", () => {
  it("is the same version as the schema here and on the server", () => {
    expect(schema["x-schemaVersion"]).toBe(SCHEMA_VERSION);
    expect(built).toEqual(schema);
  });

  it("holds the limits the schema says", () => {
    for (const [name, field] of Object.entries(CardText.shape)) {
      const max = (schema.properties as Record<string, { maxLength?: number }>)[name].maxLength!;
      expect(field.safeParse("x".repeat(max)).success, name).toBe(true);
      expect(field.safeParse("x".repeat(max + 1)).success, name).toBe(false);
    }
  });

  it("keeps the writing standard stricter than the limit", () => {
    const post = { kind: "post", title: "", body: "Short.", hashtags: [], altText: "", unicodeStyles: false, attachment: "card", card: {}, status: "draft", revision: 1, version: 1 };
    expect(Post.safeParse(post).success).toBe(true);
    expect(PostStandard.safeParse(post).success).toBe(false);
  });
});
