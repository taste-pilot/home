export * from "./schema.js";
export { applyBrandDna, type SourceTreatment } from "./resolve.js";
export { validateCanon, type CanonValidationResult } from "./validate.js";
export {
  installCanon,
  installCanonStyle,
  unexpectedCanonEntries,
  type CanonInstallResult,
} from "./install.js";
export { LocalCanonRegistry, RegistryCanonSource, type CanonRegistry } from "./registry.js";
export {
  HttpCanonRegistry,
  CanonRegistryError,
  validateRemoteCanon,
  CANON_URL_ENV,
  type HttpCanonRegistryOptions,
} from "./http-registry.js";
export {
  CanonResolver,
  bundledCanonSource,
  localCanonSource,
  defaultResolver,
  loadCanonDir,
  installedCanonRoot,
  CANON_FILES,
  type CanonSource,
  type CanonSourceKind,
  type CanonSummary,
} from "./load.js";

import { CanonResolver, bundledCanonSource, localCanonSource } from "./load.js";
import { RegistryCanonSource } from "./registry.js";
import { HttpCanonRegistry, CANON_URL_ENV } from "./http-registry.js";
import type { CanonStyle } from "./schema.js";
import type { CanonSummary } from "./load.js";

/**
 * The source chain this machine actually has: bundled starters, local
 * installs, and a remote registry ONLY when one is configured. With
 * TASTEPILOT_CANON_URL unset there is no remote source in the chain at all,
 * so "zero remote dependency" is structural rather than a promise.
 */
export function configuredResolver(): CanonResolver {
  const sources = [bundledCanonSource(), localCanonSource()];
  const url = process.env[CANON_URL_ENV];
  if (url) sources.push(new RegistryCanonSource("community", new HttpCanonRegistry(url)));
  return new CanonResolver(sources);
}

/** Load a canon by id through the configured source chain. */
export function loadCanon(id: string): Promise<CanonStyle> {
  return configuredResolver().loadCanon(id);
}

/** List every canon available to this user, across all sources. */
export function listCanons(): Promise<CanonSummary[]> {
  return configuredResolver().listCanons();
}
