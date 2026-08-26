import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { loadCanon } from "../../src/canon/index.js";
import { renderPublication } from "../../src/renderer/index.js";
import { composePdf } from "../../src/print/index.js";
import type { SemanticDocument } from "../../src/semantic/schema.js";
import type { ArtDirectionPlan } from "../../src/art-direction/schema.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Build the stress document: markdown + hand-added callout and statistic. */
async function stressDocument(): Promise<SemanticDocument> {
  const source = await readFile(join(here, "..", "..", "fixtures", "print-stress.md"), "utf8");
  const doc = ingestMarkdown(source, "./fixtures/print-stress.md");
  const closing = doc.sections.at(-1)!;
  closing.blocks.push(
    {
      id: "closing-statistic",
      type: "statistic",
      value: "97%",
      label: "of screenshots make poor print editions",
    },
    {
      id: "closing-callout",
      type: "callout",
      title: "Remember",
      content: { text: "Compose print as its own edition.", links: [], marks: [] },
    },
  );
  return doc;
}

function stressPlan(doc: SemanticDocument): ArtDirectionPlan {
  return {
    schemaVersion: 1,
    style: "modern-editorial",
    artDensity: "light",
    motion: "gentle",
    sections: doc.sections.map((s, i) => ({
      sectionId: s.id,
      composition: i === 0 ? "opening-editorial" : "standard",
      ...(i === 0 ? { dropCap: "classic-5" as const } : {}),
      artwork: [],
      pullQuotes: [],
      statistics: [],
      callouts: [],
    })),
  };
}

test("print stress: letter and a4 editions compose with sane page counts", async () => {
  test.setTimeout(120_000);
  const doc = await stressDocument();
  const plan = stressPlan(doc);
  const canon = await loadCanon("modern-editorial");
  const dir = await mkdtemp(join(tmpdir(), "tp-print-"));
  await renderPublication({ document: doc, canon, plan }, dir);

  const css = await readFile(join(dir, "publication.css"), "utf8");
  expect(css).toContain("print composition");
  expect(css).toContain("break-inside: avoid");
  expect(css).toContain("orphans: 3");

  const letter = await composePdf(join(dir, "index.html"), {
    format: "letter",
    out: join(dir, "letter.pdf"),
  });
  expect(letter.pageCount).toBeGreaterThan(0);
  expect(letter.pageCount, "blank-page explosion").toBeLessThan(12);
  expect(letter.warnings).toEqual([]);
  expect((await stat(letter.path)).size).toBeGreaterThan(10_000);

  const a4 = await composePdf(join(dir, "index.html"), {
    format: "a4",
    out: join(dir, "a4.pdf"),
  });
  expect(a4.pageCount).toBeGreaterThan(0);
  expect(a4.pageCount).toBeLessThan(12);
});

test("print edition uses the light palette even when reader chose dark", async () => {
  const doc = await stressDocument();
  const plan = stressPlan(doc);
  const canon = await loadCanon("modern-editorial");
  const dir = await mkdtemp(join(tmpdir(), "tp-print-dark-"));
  await renderPublication({ document: doc, canon, plan }, dir);
  const css = await readFile(join(dir, "publication.css"), "utf8");
  // The print block re-pins light tokens with data-theme="dark" specificity.
  expect(css).toMatch(/@media print\s*{[^]*:root\[data-theme="dark"\][^]*--paper: #faf7f1/);
});
