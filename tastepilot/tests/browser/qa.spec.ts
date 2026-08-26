import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { loadCanon } from "../../src/canon/index.js";
import { validatePlanAgainstDocument } from "../../src/art-direction/index.js";
import { renderPublication } from "../../src/renderer/index.js";
import { runQa } from "../../src/qa/index.js";

const here = dirname(fileURLToPath(import.meta.url));

async function renderFixture(dir: string): Promise<void> {
  const source = await readFile(join(here, "..", "..", "fixtures", "long-guide.md"), "utf8");
  const planRaw = JSON.parse(
    await readFile(join(here, "..", "..", "fixtures", "art-direction-plan.json"), "utf8"),
  );
  const doc = ingestMarkdown(source, "./fixtures/long-guide.md");
  // Drop the broken fixture image reference for a clean-run baseline.
  for (const section of doc.sections) {
    section.blocks = section.blocks.filter((b) => b.type !== "image");
  }
  const result = validatePlanAgainstDocument(planRaw, doc);
  if (!result.ok || !result.plan) throw new Error(result.errors.join("\n"));
  const canon = await loadCanon("modern-editorial");
  await renderPublication({ document: doc, canon, plan: result.plan }, dir);
}

test("qa passes a healthy publication and saves three screenshots", async () => {
  test.setTimeout(120_000);
  const dir = await mkdtemp(join(tmpdir(), "tp-qa-good-"));
  await renderFixture(dir);
  const report = await runQa(dir);
  expect(report.failures).toEqual([]);
  expect(report.pass).toBe(true);
  expect(report.screenshots).toHaveLength(3);
  for (const shot of report.screenshots) expect(existsSync(shot)).toBe(true);
  expect(existsSync(join(dir, "qa", "qa-report.json"))).toBe(true);
});

test("qa catches overflow and broken images", async () => {
  test.setTimeout(120_000);
  const dir = await mkdtemp(join(tmpdir(), "tp-qa-bad-"));
  await renderFixture(dir);
  // Sabotage the publication the way real-world breakage happens.
  const html = await readFile(join(dir, "index.html"), "utf8");
  const broken = html.replace(
    "<main class=\"pub-body\">",
    "<main class=\"pub-body\"><div style=\"width:3000px;height:10px\"></div><img src=\"assets/nope.png\" alt=\"\">",
  );
  await writeFile(join(dir, "index.html"), broken, "utf8");

  const report = await runQa(dir);
  expect(report.pass).toBe(false);
  const checks = report.failures.map((f) => f.check);
  expect(checks).toContain("horizontal-overflow");
  expect(checks).toContain("broken-image");
});
