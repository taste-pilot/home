export * from "./schema.js";
export { applyBrandDna, type SourceTreatment } from "./resolve.js";
export { validateCanon, type CanonValidationResult } from "./validate.js";
export { LocalCanonRegistry, type CanonRegistry } from "./registry.js";
export {
  CanonResolver,
  bundledCanonSource,
  localCanonSource,
  defaultResolver,
  loadCanonDir,
  type CanonSource,
  type CanonSourceKind,
  type CanonSummary,
} from "./load.js";

import { defaultResolver } from "./load.js";
import type { CanonStyle } from "./schema.js";
import type { CanonSummary } from "./load.js";

/** Load a canon by id through the default source chain. */
export function loadCanon(id: string): Promise<CanonStyle> {
  return defaultResolver().loadCanon(id);
}

/** List every canon available to this user, across all sources. */
export function listCanons(): Promise<CanonSummary[]> {
  return defaultResolver().listCanons();
}
