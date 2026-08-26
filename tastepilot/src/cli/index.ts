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
  render                        Render a publication from document+canon+plan   (M4)
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

  process.stderr.write(`tastepilot: unknown or not-yet-implemented command "${command}"\n`);
  process.stdout.write(HELP);
  return 1;
}

main().then((code) => {
  process.exitCode = code;
});
