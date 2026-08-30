#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, flagValue, type ParsedArgs } from "./args.js";

const HELP = `
tastepilot — Editorial Intelligence for AI agents

Turn writing into art-directed HTML publications and print-ready PDFs.

Usage:
  tastepilot <command> [options]

Commands:
  ingest <file> [--out <dir>]        Convert .txt/.md/.html into a Semantic Document
  ingest-url <url> [--mode evolve]   Convert a public webpage, extracting Brand DNA
  render --document <json> --canon <id> --plan <json>
         [--manifest <json>] [--assets <dir>] [--brand-dna <json> --mode <m>] [--out <dir>]
                                     Render the publication (HTML/CSS/JS/JSON)
  pdf <index.html> [--format letter|a4]  Compose the print edition PDF
  qa [publication-dir]               Screenshot 3 viewports + mechanical checks
  canons                             List every canon available, across all sources
  canon validate|list|install        Canon tooling

Run this inside a project that contains the tastepilot/ folder.
Docs: https://tastepilot.org
`;

const USAGE: Record<string, string> = {
  ingest: "tastepilot ingest <file> [--out <dir>]",
  "ingest-url": "tastepilot ingest-url <http(s) url> [--mode evolve] [--out <dir>]",
  render:
    "tastepilot render --document <json> --canon <id> --plan <json> [--manifest <json>] [--assets <dir>] [--brand-dna <json> --mode <m>] [--out <dir>]",
  pdf: "tastepilot pdf <path/to/index.html> [--format letter|a4] [--out <file>]",
  qa: "tastepilot qa [publication-dir]",
  canon: "tastepilot canon validate|list|install <path/to/canon-folder>",
};

function usageError(command: string, detail?: string): number {
  if (detail) process.stderr.write(`tastepilot: ${detail}\n`);
  process.stderr.write(`usage: ${USAGE[command]}\n`);
  return 1;
}

/** Unknown options are refused rather than ignored — a typo'd flag is a bug. */
function rejectUnknownFlags(command: string, args: ParsedArgs): number | undefined {
  if (args.unknown.length === 0) return undefined;
  return usageError(command, `unknown option ${args.unknown.join(", ")}`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  if (command === "ingest") {
    const args = parseArgs(rest, ["out"]);
    const bad = rejectUnknownFlags(command, args);
    if (bad !== undefined) return bad;
    const file = args.positionals[0];
    if (!file) return usageError(command);
    const outDir = flagValue(args, "out") ?? "output";

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

  if (command === "ingest-url") {
    const args = parseArgs(rest, ["mode", "out"]);
    const bad = rejectUnknownFlags(command, args);
    if (bad !== undefined) return bad;
    const url = args.positionals[0];
    if (!url || !/^https?:\/\//.test(url)) return usageError(command);
    const mode = flagValue(args, "mode") ?? "evolve";
    if (mode !== "preserve" && mode !== "evolve" && mode !== "reinvent") {
      process.stderr.write(`unknown mode "${mode}" — use preserve, evolve, or reinvent\n`);
      return 1;
    }
    const outDir = flagValue(args, "out") ?? "output";

    const { ingestUrl } = await import("../ingest/url.js");
    const { serializeDocument } = await import("../semantic/serialize.js");
    const result = await ingestUrl(url);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "semantic-document.json"), serializeDocument(result.document), "utf8");
    await writeFile(
      join(outDir, "brand-dna.json"),
      JSON.stringify(result.brandDna, null, 2) + "\n",
      "utf8",
    );
    process.stdout.write(`✓ Semantic Document + Brand DNA written to ${outDir}/\n`);
    process.stdout.write(
      `  ${result.document.metadata.title || "(untitled)"} — mode ${mode} (applied at render time)\n`,
    );
    return 0;
  }

  if (command === "render") {
    const args = parseArgs(rest, [
      "document",
      "canon",
      "plan",
      "manifest",
      "assets",
      "brand-dna",
      "mode",
      "out",
    ]);
    const bad = rejectUnknownFlags(command, args);
    if (bad !== undefined) return bad;
    const flag = (name: string): string | undefined => flagValue(args, name);
    const documentPath = flag("document");
    const canonId = flag("canon");
    const planPath = flag("plan");
    if (!documentPath || !canonId || !planPath) return usageError(command);
    const outDir = flag("out") ?? join("output", "publication");

    const { readFile } = await import("node:fs/promises");
    const { deserializeDocument } = await import("../semantic/serialize.js");
    const { loadCanon } = await import("../canon/index.js");
    const { validatePlanAgainstDocument } = await import("../art-direction/index.js");
    const { renderPublication } = await import("../renderer/index.js");

    const doc = deserializeDocument(await readFile(documentPath, "utf8"));
    let canon = await loadCanon(canonId);

    // Optional Brand DNA blending (Preserve / Evolve / Reinvent).
    const dnaPath = flag("brand-dna");
    if (dnaPath) {
      const mode = flag("mode") ?? "evolve";
      if (mode !== "preserve" && mode !== "evolve" && mode !== "reinvent") {
        process.stderr.write(`unknown mode "${mode}" — use preserve, evolve, or reinvent\n`);
        return 1;
      }
      const { BrandDnaSchema } = await import("../ingest/brand-dna.js");
      const { applyBrandDna } = await import("../canon/index.js");
      const dna = BrandDnaSchema.parse(JSON.parse(await readFile(dnaPath, "utf8")));
      canon = applyBrandDna(canon, dna, mode);
    }
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

  if (command === "pdf") {
    const args = parseArgs(rest, ["format", "out"]);
    const bad = rejectUnknownFlags(command, args);
    if (bad !== undefined) return bad;
    const file = args.positionals[0];
    if (!file) return usageError(command);
    const format = flagValue(args, "format");
    if (format !== undefined && format !== "letter" && format !== "a4") {
      process.stderr.write(`unknown format "${format}" — use letter or a4\n`);
      return 1;
    }
    const out = flagValue(args, "out");

    const { composePdf } = await import("../print/index.js");
    const result = await composePdf(file, {
      ...(format ? { format } : {}),
      ...(out ? { out } : {}),
    });
    process.stdout.write(`✓ Print edition composed: ${result.path} (${result.pageCount} pages)\n`);
    for (const warning of result.warnings) process.stdout.write(`  ⚠ ${warning}\n`);
    return 0;
  }

  if (command === "qa") {
    const args = parseArgs(rest, []);
    const bad = rejectUnknownFlags(command, args);
    if (bad !== undefined) return bad;
    const dir = args.positionals[0] ?? join("output", "publication");
    const { runQa } = await import("../qa/index.js");
    const report = await runQa(dir);
    process.stdout.write(
      report.pass ? `✓ QA passed for ${dir}\n` : `✗ QA FAILED for ${dir}\n`,
    );
    for (const f of report.failures) {
      process.stdout.write(`  ✗ [${f.viewport}] ${f.check}: ${f.detail}\n`);
    }
    for (const w of report.warnings) {
      process.stdout.write(`  ⚠ [${w.viewport}] ${w.check}: ${w.detail}\n`);
    }
    process.stdout.write(`  Report: ${join(dir, "qa", "qa-report.json")}\n`);
    return report.pass ? 0 : 1;
  }

  if (command === "canon") {
    const args = parseArgs(rest, []);
    const bad = rejectUnknownFlags(command, args);
    if (bad !== undefined) return bad;
    const [sub, target] = args.positionals;
    const { validateCanon } = await import("../canon/index.js");

    if (sub === "validate") {
      if (!target) {
        process.stderr.write("usage: tastepilot canon validate <path/to/canon-folder>\n");
        return 1;
      }
      const result = await validateCanon(target);
      if (!result.ok) {
        process.stdout.write(`✗ ${target} is not a valid canon:\n`);
        for (const err of result.errors) process.stdout.write(`  - ${err}\n`);
        return 1;
      }
      process.stdout.write(
        `✓ ${result.style!.manifest.name} (${result.style!.manifest.id}@${result.style!.manifest.version}) is valid\n`,
      );
      const { unexpectedCanonEntries } = await import("../canon/index.js");
      const extra = await unexpectedCanonEntries(target);
      if (extra.length > 0) {
        process.stdout.write(
          `! ${extra.length} file(s) here are not part of a canon and will block install: ${extra.join(", ")}\n`,
        );
      }
      return 0;
    }

    if (sub === "install") {
      if (!target) {
        process.stderr.write("usage: tastepilot canon install <path/to/canon-folder>\n");
        return 1;
      }
      const { installCanon } = await import("../canon/index.js");
      const result = await installCanon(target);
      if (!result.ok) {
        process.stdout.write(`✗ refusing to install this canon:\n`);
        for (const err of result.errors) process.stdout.write(`  - ${err}\n`);
        return 1;
      }
      process.stdout.write(
        `✓ installed ${result.style!.manifest.id} — now listed as a "local" canon source\n`,
      );
      return 0;
    }

    if (sub === "list") {
      const { listCanons } = await import("../canon/index.js");
      for (const canon of await listCanons()) {
        process.stdout.write(
          `${canon.id.padEnd(22)} ${canon.version.padEnd(8)} ${canon.source.padEnd(10)} ${canon.description}\n`,
        );
      }
      return 0;
    }

    process.stderr.write("usage: tastepilot canon validate|install <dir> | canon list\n");
    return 1;
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

/**
 * Run only as the entry point, so tests can import main() without the module
 * executing against the test runner's argv.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      // A failure the user caused (a missing file, a bad URL) is a message,
      // not a Node stack trace. Set TASTEPILOT_DEBUG=1 for the stack.
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`tastepilot: ${message}\n`);
      if (process.env.TASTEPILOT_DEBUG && err instanceof Error && err.stack) {
        process.stderr.write(`${err.stack}\n`);
      }
      process.exitCode = 1;
    });
}
