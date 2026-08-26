import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SemanticDocumentSchema } from "../src/semantic/schema.js";
import { serializeDocument, deserializeDocument } from "../src/semantic/serialize.js";
import { slugify, sectionId, blockId } from "../src/semantic/ids.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (p: string) => readFileSync(join(here, "..", "fixtures", p), "utf8");

describe("SemanticDocument schema", () => {
  it("validates the hand-authored simple-article fixture", () => {
    const doc = JSON.parse(fixture("expected/simple-article.json"));
    const parsed = SemanticDocumentSchema.parse(doc);
    expect(parsed.metadata.title).toBe("The Quiet Craft of Reading Well");
    expect(parsed.sections).toHaveLength(3);
  });

  it("rejects unknown keys — styling can never ride through", () => {
    const doc = JSON.parse(fixture("expected/simple-article.json"));
    doc.sections[0].blocks[0].css = { color: "red" };
    expect(() => SemanticDocumentSchema.parse(doc)).toThrow();
  });

  it("rejects unknown block types", () => {
    const doc = JSON.parse(fixture("expected/simple-article.json"));
    doc.sections[0].blocks[0].type = "hero-banner";
    expect(() => SemanticDocumentSchema.parse(doc)).toThrow();
  });

  it("rejects duplicate ids anywhere in the document", () => {
    const doc = JSON.parse(fixture("expected/simple-article.json"));
    doc.sections[2].blocks[0].id = doc.sections[1].blocks[0].id;
    expect(() => SemanticDocumentSchema.parse(doc)).toThrow(/duplicate/);
  });

  it("rejects styling-free but structurally malformed documents", () => {
    expect(() => SemanticDocumentSchema.parse({ schemaVersion: 1 })).toThrow();
    expect(() =>
      SemanticDocumentSchema.parse({
        schemaVersion: 2,
        metadata: { title: "x" },
        source: { type: "markdown", location: "a" },
        sections: [],
      }),
    ).toThrow();
  });
});

describe("serialization", () => {
  it("round-trips byte-identically", () => {
    const doc = deserializeDocument(fixture("expected/simple-article.json"));
    const once = serializeDocument(doc);
    const twice = serializeDocument(deserializeDocument(once));
    expect(twice).toBe(once);
  });

  it("preserves prose byte-identically through parse", () => {
    const raw = JSON.parse(fixture("expected/simple-article.json"));
    const doc = SemanticDocumentSchema.parse(raw);
    const firstBlock = doc.sections[0]!.blocks[0]!;
    if (firstBlock.type !== "paragraph") throw new Error("fixture changed");
    expect(firstBlock.content.text).toBe(raw.sections[0].blocks[0].content.text);
  });

  it("rejects invalid JSON with a clear error", () => {
    expect(() => deserializeDocument("{nope")).toThrow(/not valid JSON/);
  });
});

describe("stable ids", () => {
  it("slugifies predictably", () => {
    expect(slugify("Why Measure Matters")).toBe("why-measure-matters");
    expect(slugify("  Élan & Verve!  ")).toBe("elan-verve");
    expect(slugify("")).toBe("untitled");
  });

  it("is deterministic across runs", () => {
    const a = sectionId("The Long View", 0, new Set());
    const b = sectionId("The Long View", 0, new Set());
    expect(a).toBe(b);
  });

  it("dedupes collisions stably", () => {
    const taken = new Set<string>();
    expect(sectionId("Intro", 0, taken)).toBe("intro");
    expect(sectionId("Intro", 1, taken)).toBe("intro-2");
    expect(blockId("intro", 0, "paragraph", taken)).toBe("intro-paragraph-1");
    expect(blockId("intro", 0, "paragraph", taken)).toBe("intro-paragraph-1-2");
  });
});
