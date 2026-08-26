#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HELP = `
tastepilot — Editorial Intelligence for AI agents

Turn writing into art-directed HTML publications and print-ready PDFs.

Usage:
  tastepilot <command> [options]

Commands:
  ingest <file> [--out <dir>]   Convert .txt/.md/.html into a Semantic Document
  ingest-url <url>              Convert a public webpage, with Brand DNA        (M7)
  render --document <json> --canon <id> --plan <json> [--out <dir>]
                                Render the publication (HTML/CSS/JS/JSON)
  canons                        List every canon available, across all sources
  pdf <index.html>              Produce the print-composed PDF edition          (M8)
  canon validate|list|install   Canon tooling                                   (M11)

Run this inside a project that contains the tastepilot/ folder.
Docs: https://tastepilot.org
`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === "ingest") {
    const file = rest.find((a) => !a.startsWith("--"));
    if (!file) {
      process.stderr.write("usage: tastepilot ingest <file> [--out <dir>]\n");
      return 1;
    }
    const outFlag = rest.indexOf("--out");
    const outDir = outFlag >= 0 && rest[outFlag + 1] ? rest[outFlag + 1]! : "output";

    const { ingestFile } = await import("../ingest/index.js");
    const { serializeDocument } = await import("../semantic/serialize.js");
    const doc = await ingestFile(file);
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, "semantic-document.json");
    await writeFile(outPath, serializeDocument(doc), "utf8");
    process.stdout.write(`✓ Semantic Document written to ${outPath}\n`);
    process.stdout.write(
      `  ${doc.metadata.title || "(untitled)"} — ${doc.sections.length} section(s)\n`,
    );
    return 0;
  }

  if (command === "render") {
    const flag = (name: string): string | undefined => {
      const i = rest.indexOf(`--${name}`);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    const documentPath = flag("document");
    const canonId = flag("canon");
    const planPath = flag("plan");
    if (!documentPath || !canonId || !planPath) {
      process.stderr.write(
        "usage: tastepilot render --document <json> --canon <id> --plan <json> [--out <dir>]\n",
      );
      return 1;
    }
    const outDir = flag("out") ?? join("output", "publication");

    const { readFile } = await import("node:fs/promises");
    const { deserializeDocument } = await import("../semantic/serialize.js");
    const { loadCanon } = await import("../canon/index.js");
    const { validatePlanAgainstDocument } = await import("../art-direction/index.js");
    const { renderPublication } = await import("../renderer/index.js");

    const doc = deserializeDocument(await readFile(documentPath, "utf8"));
    const canon = await loadCanon(canonId);
    const planResult = validatePlanAgainstDocument(
      JSON.parse(await readFile(planPath, "utf8")),
      doc,
    );
    if (!planResult.ok || !planResult.plan) {
      process.stderr.write("Art Direction Plan is invalid:\n");
      for (const err of planResult.errors) process.stderr.write(`  - ${err}\n`);
      return 1;
    }

    // Durable artwork: sync the manifest with the plan, fill in placeholders
    // for anything missing, and reuse everything that already exists.
    const manifestPath = flag("manifest") ?? "artwork-manifest.json";
    const assetsDir = flag("assets") ?? "assets";
    const {
      loadManifest,
      saveManifest,
      syncManifestWithPlan,
      ensureArtworkFiles,
      artworkFilesFromManifest,
    } = await import("../artwork/index.js");
    let manifest = await loadManifest(manifestPath);
    manifest = syncManifestWithPlan(manifest, planResult.plan);
    manifest = await ensureArtworkFiles(manifest, planResult.plan, assetsDir);
    await saveManifest(manifestPath, manifest);

    const result = await renderPublication(
      {
        document: doc,
        canon,
        plan: planResult.plan,
        artworkFiles: artworkFilesFromManifest(manifest),
        assetsSourceDir: assetsDir,
      },
      outDir,
    );
    process.stdout.write(`✓ Publication rendered to ${result.outDir}/\n`);
    process.stdout.write(`  ${result.files.join(" · ")}\n`);
    process.stdout.write(`  Preview: open ${join(result.outDir, "index.html")}\n`);
    return 0;
  }

  if (command === "canons") {
    const { listCanons } = await import("../canon/index.js");
    const canons = await listCanons();
    for (const canon of canons) {
      process.stdout.write(
        `${canon.id.padEnd(22)} ${canon.version.padEnd(8)} ${canon.source.padEnd(10)} ${canon.description}\n`,
      );
    }
    return 0;
  }

  process.stderr.write(`tastepilot: unknown or not-yet-implemented command "${command}"\n`);
  process.stdout.write(HELP);
  return 1;
}

main().then((code) => {
  process.exitCode = code;
});
