/**
 * THE CENTERPIECE DEMO.
 *
 * One document. One artwork manifest. Three canons. The script proves the
 * core architecture — content is permanent, artwork is durable, design is
 * disposable — by rendering the same Semantic Document and the same assets
 * through three radically different editorial grammars, then failing loudly
 * if either shared input drifted between runs.
 *
 * Run from tastepilot/:  pnpm demo
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMarkdown } from "../src/ingest/index.js";
import { serializeDocument } from "../src/semantic/serialize.js";
import type { SemanticDocument } from "../src/semantic/schema.js";
import { loadCanon } from "../src/canon/index.js";
import { validatePlanAgainstDocument } from "../src/art-direction/index.js";
import type { ArtDirectionPlan } from "../src/art-direction/schema.js";
import {
  EMPTY_MANIFEST,
  artworkFilesFromManifest,
  ensureArtworkFiles,
  syncManifestWithPlan,
} from "../src/artwork/index.js";
import { renderPublication } from "../src/renderer/index.js";
import { runQa } from "../src/qa/index.js";
import { composePdf } from "../src/print/index.js";
import { settlePage } from "../src/browser/settle.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const repoRoot = join(pkgRoot, "..");
const demoDir = join(repoRoot, "examples", "demo");
const CANONS = ["modern-editorial", "literary-classic", "swiss-clean"] as const;

/** The Art Director pass: the plan, authored once, reused by every canon. */
function artDirectionPlan(doc: SemanticDocument): ArtDirectionPlan {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const statisticsIn = (sectionId: string, treatment: "oversized" | "panel" | "inline") =>
    (byId.get(sectionId)?.blocks ?? [])
      .filter((b) => b.type === "statistic")
      .map((b) => ({ blockId: b.id, treatment }));
  const calloutsIn = (sectionId: string) =>
    (byId.get(sectionId)?.blocks ?? [])
      .filter((b) => b.type === "callout")
      .map((b) => ({ blockId: b.id, treatment: "panel" as const }));
  const quoteIn = (sectionId: string) =>
    (byId.get(sectionId)?.blocks ?? [])
      .filter((b) => b.type === "quote")
      .map((b) => ({ blockId: b.id }));

  return {
    schemaVersion: 1,
    style: "modern-editorial",
    artDensity: "medium",
    motion: "gentle",
    sections: [
      {
        sectionId: "section-1",
        composition: "opening-editorial",
        dropCap: "classic-5",
        artwork: [],
        pullQuotes: [],
        statistics: [],
        callouts: [],
      },
      {
        sectionId: "why-presentation-decides-what-happens",
        composition: "statistic-break",
        artwork: [],
        pullQuotes: quoteIn("why-presentation-decides-what-happens"),
        statistics: statisticsIn("why-presentation-decides-what-happens", "oversized"),
        callouts: [],
      },
      {
        sectionId: "the-anatomy-of-attention",
        composition: "margin-art-right",
        artwork: [
          {
            id: "attention-lamp",
            placement: "right",
            wrap: "silhouette",
            size: "medium",
            brief:
              "A reading lamp casting warm light over an open book — transparent editorial line art.",
          },
        ],
        pullQuotes: [],
        statistics: [],
        callouts: [],
      },
      {
        sectionId: "the-five-decisions",
        composition: "margin-art-left",
        artwork: [
          {
            id: "decisions-compass",
            placement: "left",
            wrap: "silhouette",
            size: "medium",
            brief: "A drafting compass drawing an arc — transparent editorial line art.",
          },
        ],
        pullQuotes: [],
        statistics: [],
        callouts: calloutsIn("the-five-decisions"),
      },
      {
        sectionId: "common-failures-and-what-they-cost",
        composition: "diagram-section",
        artwork: [],
        pullQuotes: [],
        statistics: [],
        callouts: [],
      },
      {
        sectionId: "what-restraint-buys-you",
        composition: "quiet-section",
        artwork: [],
        pullQuotes: [],
        statistics: statisticsIn("what-restraint-buys-you", "panel"),
        callouts: [],
      },
      {
        sectionId: "where-to-start-tomorrow",
        composition: "standard",
        artwork: [],
        pullQuotes: [],
        statistics: [],
        callouts: calloutsIn("where-to-start-tomorrow"),
      },
    ],
  };
}

async function main(): Promise<void> {
  const sourcePath = join(pkgRoot, "fixtures", "demo-lead-magnet.md");
  const source = await readFile(sourcePath, "utf8");

  // Ingest + editor pass — ONCE. Every canon receives these same bytes.
  const doc = ingestMarkdown(source, "./source.md");
  const plan = artDirectionPlan(doc);
  const validation = validatePlanAgainstDocument(plan, doc);
  if (!validation.ok) throw new Error("demo plan invalid:\n" + validation.errors.join("\n"));

  await mkdir(join(demoDir, "assets"), { recursive: true });
  await cp(join(pkgRoot, "fixtures", "demo-assets"), join(demoDir, "assets"), {
    recursive: true,
  });
  await cp(sourcePath, join(demoDir, "source.md"));

  // Durable artwork — ONE manifest for all three canons.
  let manifest = syncManifestWithPlan(structuredClone(EMPTY_MANIFEST), plan);
  manifest = await ensureArtworkFiles(manifest, plan, join(demoDir, "assets"));
  const artworkFiles = artworkFilesFromManifest(manifest);

  const docJson = serializeDocument(doc);
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(join(demoDir, "semantic-document.json"), docJson, "utf8");
  await writeFile(join(demoDir, "artwork-manifest.json"), manifestJson, "utf8");
  await writeFile(
    join(demoDir, "art-direction-plan.json"),
    JSON.stringify(plan, null, 2) + "\n",
    "utf8",
  );

  for (const canonId of CANONS) {
    const outDir = join(demoDir, canonId);
    const canon = await loadCanon(canonId);
    await renderPublication(
      {
        document: doc,
        canon,
        plan: { ...plan, style: canonId },
        artworkFiles,
        assetsSourceDir: join(demoDir, "assets"),
      },
      outDir,
    );
    const qa = await runQa(outDir);
    if (!qa.pass) {
      throw new Error(
        `QA failed for ${canonId}:\n` +
          qa.failures.map((f) => `  ${f.check}: ${f.detail}`).join("\n"),
      );
    }
    for (const w of qa.warnings) {
      process.stdout.write(`  ⚠ ${canonId} [${w.viewport}] ${w.check}: ${w.detail}\n`);
    }
    const pdf = await composePdf(join(outDir, "index.html"));
    process.stdout.write(`✓ ${canonId}: HTML + QA + PDF (${pdf.pageCount} pages)\n`);

    // THE PROOF: the shared inputs must not have drifted.
    if (serializeDocument(doc) !== docJson) throw new Error("semantic document mutated!");
    if (JSON.stringify(manifest, null, 2) + "\n" !== manifestJson) {
      throw new Error("artwork manifest mutated!");
    }
  }

  process.stdout.write(
    "\n✓ Same document. Same artwork. Three publications.\n" +
      `  ${demoDir}/{${CANONS.join(",")}}\n`,
  );

  await syncSite(source);
}

/** Copy the demo into the website and capture marketing screenshots. */
async function syncSite(source: string): Promise<void> {
  const siteDemo = join(repoRoot, "site", "demo");
  for (const canonId of CANONS) {
    await cp(join(demoDir, canonId), join(siteDemo, canonId), {
      recursive: true,
      filter: (src) => !src.includes(`${canonId}/qa`),
    });
  }

  // The "before": the same words as the raw file every writer starts with.
  const escaped = source.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const before = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Before — the raw draft</title>
</head>
<body style="margin:0; background:#ffffff; color:#111111;">
<pre style="white-space:pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; font-size:13px; line-height:1.5; padding:2rem; margin:0;">${escaped}</pre>
</body>
</html>
`;
  await mkdir(join(siteDemo, "before"), { recursive: true });
  await writeFile(join(siteDemo, "before", "index.html"), before, "utf8");

  // Screenshots for the homepage cards and README hero.
  const { chromium } = await import("playwright");
  const assetsDir = join(repoRoot, "site", "assets");
  await mkdir(assetsDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const target of [...CANONS, "before"]) {
      const page = await browser.newPage({
        viewport: { width: 1080, height: 1180 },
        reducedMotion: "reduce",
      });
      await page.goto("file://" + join(siteDemo, target, "index.html"), {
        waitUntil: "networkidle",
      });
      await settlePage(page);
      // The theme control is reader chrome, not the publication — the print
      // edition already drops it, and its rounded clip is the one thing on
      // these pages Skia anti-aliases differently from run to run.
      await page.addStyleTag({ content: ".theme-control { display: none !important; }" });
      await page.screenshot({ path: join(assetsDir, `demo-${target}.png`) });
      await page.close();
    }

    // Side-by-side strip for the README hero.
    const strip = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#1d1a17;display:flex;gap:14px;padding:14px;">
${CANONS.map(
  (c) =>
    `<div style="flex:1;overflow:hidden;border-radius:10px;"><img src="assets/demo-${c}.png" style="width:100%;display:block;"></div>`,
).join("")}
</body></html>`;
    const stripPath = join(repoRoot, "site", "_strip.html");
    await writeFile(stripPath, strip, "utf8");
    const page = await browser.newPage({ viewport: { width: 1600, height: 620 } });
    await page.goto("file://" + stripPath, { waitUntil: "networkidle" });
    await settlePage(page);
    await page.screenshot({ path: join(assetsDir, "demo-strip.png") });
    await page.close();
    const { rm } = await import("node:fs/promises");
    await rm(stripPath);
  } finally {
    await browser.close();
  }
  process.stdout.write(`✓ Site demo synced: site/demo/ + site/assets/demo-*.png\n`);
}

await main();
