import { describe, expect, it, beforeAll } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMarkdown } from "../src/ingest/index.js";
import { loadCanon } from "../src/canon/index.js";
import { validatePlanAgainstDocument } from "../src/art-direction/index.js";
import { renderPublication } from "../src/renderer/index.js";
import { renderInline } from "../src/renderer/html.js";
import type { ArtDirectionPlan } from "../src/art-direction/schema.js";
import type { SemanticDocument } from "../src/semantic/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (p: string) => readFileSync(join(here, "..", "fixtures", p), "utf8");

const STARTERS = [
  "modern-editorial",
  "swiss-clean",
  "literary-classic",
  "technical-journal",
  "playful-illustrated",
];

let doc: SemanticDocument;
let plan: ArtDirectionPlan;

beforeAll(() => {
  doc = ingestMarkdown(fixture("long-guide.md"), "./fixtures/long-guide.md");
  const result = validatePlanAgainstDocument(JSON.parse(fixture("art-direction-plan.json")), doc);
  if (!result.ok || !result.plan) throw new Error(result.errors.join("\n"));
  plan = result.plan;
});

async function renderTo(canonId: string, dir: string) {
  const canon = await loadCanon(canonId);
  return renderPublication({ document: doc, canon, plan: { ...plan, style: canonId } }, dir);
}

describe("deterministic renderer", () => {
  it("renders the long guide under all five canons", async () => {
    for (const id of STARTERS) {
      const dir = await mkdtemp(join(tmpdir(), `tp-${id}-`));
      const result = await renderTo(id, dir);
      expect(result.files).toEqual([
        "index.html",
        "publication.css",
        "publication.js",
        "publication.json",
      ]);
      const html = await readFile(join(dir, "index.html"), "utf8");
      expect(html).toContain("The Working Writer");
      expect(html).toContain(`data-canon="${id}"`);
    }
  });

  it("RED LINE: same inputs produce byte-identical output", async () => {
    const dirA = await mkdtemp(join(tmpdir(), "tp-det-a-"));
    const dirB = await mkdtemp(join(tmpdir(), "tp-det-b-"));
    await renderTo("modern-editorial", dirA);
    await renderTo("modern-editorial", dirB);
    for (const file of await readdir(dirA)) {
      if (file === "assets") continue;
      const a = await readFile(join(dirA, file), "utf8");
      const b = await readFile(join(dirB, file), "utf8");
      expect(b, file).toBe(a);
    }
  });

  it("RED LINE: no framework runtime, no remote requirement beyond fonts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tp-clean-"));
    await renderTo("swiss-clean", dir);
    const html = await readFile(join(dir, "index.html"), "utf8");
    const js = await readFile(join(dir, "publication.js"), "utf8");
    expect(html).not.toMatch(/react|vue|angular|svelte/i);
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|import\s/);
    const remoteRefs = [...html.matchAll(/https?:\/\/[^"' ]+/g)].map((m) => m[0]);
    expect(remoteRefs.every((u) => u.includes("fonts.g"))).toBe(true);
  });

  it("canon treatments show up as class variants, never inline styles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tp-classes-"));
    const canon = await loadCanon("literary-classic");
    // Strip the pull-quote elevation so the quote takes the canon treatment.
    const noPq = {
      ...plan,
      style: "literary-classic",
      sections: plan.sections.map((s) => ({ ...s, pullQuotes: [] })),
    };
    await renderPublication({ document: doc, canon, plan: noPq }, dir);
    const html = await readFile(join(dir, "index.html"), "utf8");
    expect(html).toContain("quote--centered-italic");
    expect(html).toContain("divider--fleuron");
    expect(html).not.toMatch(/style="/);
  });

  it("art direction drives compositions, drop caps and placeholders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tp-plan-"));
    await renderTo("modern-editorial", dir);
    const html = await readFile(join(dir, "index.html"), "utf8");
    expect(html).toContain("section--opening-editorial");
    expect(html).toContain("dropcap--classic-5");
    expect(html).toContain("section--quiet-section");
    expect(html).toContain('data-artwork-id="anatomy-type-specimen"');
    expect(html).toContain("art--placeholder");
    expect(html).toContain("pull-quote");
  });

  it("publications carry paired light/dark tokens, not inversion", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tp-theme-"));
    await renderTo("modern-editorial", dir);
    const css = await readFile(join(dir, "publication.css"), "utf8");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("--paper: #faf7f1;");
    expect(css).toContain("--paper: #171412;");
  });

  it("escapes user content — hostile text cannot become markup", () => {
    const html = renderInline({
      text: 'Nice <script>alert("x")</script> try',
      links: [],
      marks: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders inline links and marks at correct offsets", () => {
    const html = renderInline({
      text: "Read the guide now",
      links: [{ start: 5, end: 14, href: "https://example.com" }],
      marks: [{ start: 5, end: 8, kind: "strong" }],
    });
    expect(html).toBe(
      'Read <a href="https://example.com"><strong>the</strong> guide</a> now',
    );
  });
});
