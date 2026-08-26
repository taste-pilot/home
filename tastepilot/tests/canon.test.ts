import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledCanonSource, defaultResolver, CanonResolver, localCanonSource } from "../src/canon/index.js";
import { validatePlan, validatePlanAgainstDocument } from "../src/art-direction/index.js";
import { ingestMarkdown } from "../src/ingest/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (p: string) => readFileSync(join(here, "..", "fixtures", p), "utf8");

const STARTERS = [
  "modern-editorial",
  "swiss-clean",
  "literary-classic",
  "technical-journal",
  "playful-illustrated",
];

describe("canon system", () => {
  it("all five starter canons pass strict schema validation", async () => {
    const source = bundledCanonSource();
    for (const id of STARTERS) {
      const style = await source.load(id);
      expect(style, id).toBeDefined();
      expect(style!.manifest.id).toBe(id);
      expect(style!.manifest.tier).toBe("starter");
    }
  });

  it("starter canons differ meaningfully, not just in color", async () => {
    const source = bundledCanonSource();
    const styles = await Promise.all(STARTERS.map((id) => source.load(id)));
    const bodies = new Set(styles.map((s) => s!.typography.body.family));
    const ratios = new Set(styles.map((s) => s!.typography.scaleRatio));
    const measures = new Set(styles.map((s) => s!.layout.measureCh));
    const dropCaps = new Set(styles.map((s) => s!.manifest.dropCaps.preferred));
    const quoteTreatments = new Set(styles.map((s) => s!.layout.quoteTreatment));
    expect(bodies.size).toBeGreaterThanOrEqual(4);
    expect(ratios.size).toBeGreaterThanOrEqual(4);
    expect(measures.size).toBeGreaterThanOrEqual(4);
    expect(dropCaps.size).toBeGreaterThanOrEqual(3);
    expect(quoteTreatments.size).toBeGreaterThanOrEqual(3);
  });

  it("lists canons across all sources, source-neutral", async () => {
    const list = await defaultResolver().listCanons();
    expect(list.map((c) => c.id).sort()).toEqual([...STARTERS].sort());
    expect(list.every((c) => c.source === "bundled")).toBe(true);
  });

  it("an empty local source contributes nothing and breaks nothing", async () => {
    const resolver = new CanonResolver([localCanonSource("/nonexistent/canon/dir")]);
    expect(await resolver.listCanons()).toEqual([]);
  });

  it("unknown canon ids produce an actionable error listing what exists", async () => {
    await expect(defaultResolver().loadCanon("brutalist-zine")).rejects.toThrow(
      /unknown canon "brutalist-zine".*modern-editorial/s,
    );
  });

  it("RED LINE: canon files cannot smuggle unknown keys (no CSS injection)", async () => {
    const raw = JSON.parse(
      readFileSync(
        join(here, "..", "canon", "starter", "modern-editorial", "palette.json"),
        "utf8",
      ),
    );
    raw.customCss = "body { background: url(https://evil.example) }";
    const { PaletteSystemSchema } = await import("../src/canon/schema.js");
    expect(() => PaletteSystemSchema.parse(raw)).toThrow();
  });
});

describe("art direction plan", () => {
  const doc = ingestMarkdown(fixture("long-guide.md"), "./fixtures/long-guide.md");
  const planRaw = JSON.parse(fixture("art-direction-plan.json"));

  it("the fixture plan validates on its own and against the document", () => {
    expect(validatePlan(planRaw).ok).toBe(true);
    const result = validatePlanAgainstDocument(planRaw, doc);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("RED LINE: arbitrary CSS-like properties are rejected with a clear hint", () => {
    const bad = structuredClone(planRaw);
    bad.sections[0].css = { "font-size": "80px" };
    const result = validatePlan(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/approved vocabulary/);
  });

  it("compositions outside the controlled vocabulary are rejected", () => {
    const bad = structuredClone(planRaw);
    bad.sections[0].composition = "mega-hero-parallax";
    expect(validatePlan(bad).ok).toBe(false);
  });

  it("directions referencing unknown sections/blocks fail with named ids", () => {
    const bad = structuredClone(planRaw);
    bad.sections[0].sectionId = "does-not-exist";
    const result = validatePlanAgainstDocument(bad, doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("does-not-exist");
    expect(result.errors.join("\n")).toContain("section-1");
  });

  it("every document section must receive a direction", () => {
    const bad = structuredClone(planRaw);
    bad.sections.pop();
    const result = validatePlanAgainstDocument(bad, doc);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/has no direction/);
  });
});
