#!/usr/bin/env node

const HELP = `
tastepilot — Editorial Intelligence for AI agents

Turn writing into art-directed HTML publications and print-ready PDFs.

Usage:
  tastepilot <command> [options]

Commands (arriving milestone by milestone):
  ingest <file>              Convert .txt/.md/.html into a Semantic Document   (M2)
  ingest-url <url>           Convert a public webpage, with Brand DNA          (M7)
  render                     Render a publication from document+canon+plan     (M4)
  pdf <index.html>           Produce the print-composed PDF edition            (M8)
  canon validate|list|install  Canon tooling                                   (M11)

Run this inside a project that contains the tastepilot/ folder.
Docs: https://tastepilot.org
`;

export function main(argv: string[] = process.argv.slice(2)): number {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  process.stderr.write(`tastepilot: unknown or not-yet-implemented command "${argv[0]}"\n`);
  process.stdout.write(HELP);
  return 1;
}

process.exitCode = main();
