import { SemanticDocumentSchema, type SemanticDocument } from "./schema.js";

/** Serialize a Semantic Document to stable, human-diffable JSON. */
export function serializeDocument(doc: SemanticDocument): string {
  // Validate on the way out too — a malformed document must never be written.
  const parsed = SemanticDocumentSchema.parse(doc);
  return JSON.stringify(parsed, null, 2) + "\n";
}

/** Parse and validate JSON into a Semantic Document. Throws on malformed input. */
export function deserializeDocument(json: string): SemanticDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(`semantic document is not valid JSON: ${(err as Error).message}`);
  }
  return SemanticDocumentSchema.parse(raw);
}
