import type { ContentBlock, SemanticDocument } from "../semantic/schema.js";
import { SemanticDocumentSchema } from "../semantic/schema.js";
import { blockId, sectionId } from "../semantic/ids.js";

/**
 * Convert plain text into a Semantic Document.
 * A short first line followed by a blank line is treated as the title;
 * everything else becomes paragraphs split on blank lines, verbatim.
 */
export function ingestText(content: string, location: string): SemanticDocument {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  let title = "";
  let bodyStart = 0;
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty >= 0) {
    const candidate = lines[firstNonEmpty]!.trim();
    const next = lines[firstNonEmpty + 1];
    if (candidate.length <= 80 && (next === undefined || next.trim() === "")) {
      title = candidate;
      bodyStart = firstNonEmpty + 1;
    }
  }

  const body = lines.slice(bodyStart).join("\n");
  const chunks = body
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/^\n+|\n+$/g, ""))
    .filter((chunk) => chunk.trim().length > 0);

  const taken = new Set<string>();
  const id = sectionId(undefined, 0, taken);
  const blocks: ContentBlock[] = chunks.map((chunk, i) => ({
    id: blockId(id, i, "paragraph", taken),
    type: "paragraph",
    content: { text: chunk, links: [], marks: [] },
  }));

  return SemanticDocumentSchema.parse({
    schemaVersion: 1,
    metadata: { title, subtitle: "", author: "", language: "en" },
    source: { type: "text", location },
    sections: [{ id, blocks }],
  });
}
