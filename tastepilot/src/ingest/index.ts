import type { SemanticDocument } from "../semantic/schema.js";

/** A source ingestor converts one input kind into a Semantic Document. */
export interface Ingestor {
  /** Which source types this ingestor accepts. */
  readonly accepts: ReadonlyArray<"text" | "markdown" | "html" | "url">;
  ingest(input: IngestInput): Promise<SemanticDocument>;
}

export interface IngestInput {
  /** Raw content, or a file path / URL depending on kind. */
  readonly value: string;
  readonly kind: "text" | "markdown" | "html" | "url";
  /** Original location for provenance (file path or URL). */
  readonly location: string;
}

/** Routes any supported input to the right ingestor. Implemented in M2/M7. */
export function ingestSource(_input: IngestInput): Promise<SemanticDocument> {
  throw new Error("not implemented yet: ingestion arrives in milestone M2");
}
