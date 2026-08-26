/**
 * Canon loading is built on interchangeable SOURCES from day one:
 * bundled starter styles, user-installed/custom-local styles, and future
 * remote sources (Community Canon, TastePilot Library, via registry API).
 *
 * `loadCanon(id)` falls through sources in order for ID lookup only.
 * `listCanons()` aggregates across ALL sources with source as metadata,
 * never priority — recommendation must be source-neutral.
 */

export interface CanonSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Which source this canon came from — metadata, never a preference. */
  readonly source: CanonSourceKind;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
}

export type CanonSourceKind = "bundled" | "local" | "community" | "library";

export interface CanonSource {
  readonly kind: CanonSourceKind;
  list(): Promise<CanonSummary[]>;
  /** Returns undefined when this source does not have the canon. */
  load(id: string): Promise<unknown | undefined>;
}

/** Full schemas + bundled starter styles arrive in milestone M3. */
export function loadCanon(_id: string): Promise<unknown> {
  throw new Error("not implemented yet: the Canon system arrives in milestone M3");
}

export function listCanons(): Promise<CanonSummary[]> {
  throw new Error("not implemented yet: the Canon system arrives in milestone M3");
}
