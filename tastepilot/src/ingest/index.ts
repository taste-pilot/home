import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { SemanticDocument } from "../semantic/schema.js";
import { ingestText } from "./text.js";
import { ingestMarkdown } from "./markdown.js";
import { ingestHtml } from "./html.js";

export { ingestText, ingestMarkdown, ingestHtml };

export interface IngestInput {
  /** Raw content, or a file path / URL depending on kind. */
  readonly value: string;
  readonly kind: "text" | "markdown" | "html" | "url";
  /** Original location for provenance (file path or URL). */
  readonly location: string;
}

/** Routes any supported input to the right ingestor. URL mode arrives in M7. */
export async function ingestSource(input: IngestInput): Promise<SemanticDocument> {
  switch (input.kind) {
    case "text":
      return ingestText(input.value, input.location);
    case "markdown":
      return ingestMarkdown(input.value, input.location);
    case "html":
      return ingestHtml(input.value, input.location);
    case "url":
      throw new Error("not implemented yet: URL ingestion arrives in milestone M7");
  }
}

/** Determine the source kind for a local file path. */
export function kindForPath(path: string): "text" | "markdown" | "html" {
  const ext = extname(path).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".txt" || ext === "") return "text";
  throw new Error(`unsupported file type "${ext}" — supported: .txt, .md, .html`);
}

/** Ingest a local file by path. */
export async function ingestFile(path: string): Promise<SemanticDocument> {
  const kind = kindForPath(path);
  const value = await readFile(path, "utf8");
  return ingestSource({ value, kind, location: path });
}
