import type { CanonSource, CanonSummary } from "./load.js";
import type { CanonStyle } from "./schema.js";

/**
 * The remote-registry seam. Community Canon and TastePilot Library styles
 * arrive through implementations of this interface — served by the registry
 * API, which handles versions and entitlement. The user's agent never needs
 * repository credentials; bundled/local sources keep everything working with
 * zero remote dependency.
 */
export interface CanonRegistry {
  list(): Promise<CanonSummary[]>;
  fetch(id: string, version?: string): Promise<CanonStyle>;
}

/** Adapts any local CanonSource to the registry interface. */
export class LocalCanonRegistry implements CanonRegistry {
  constructor(private readonly source: CanonSource) {}

  list(): Promise<CanonSummary[]> {
    return this.source.list();
  }

  async fetch(id: string, _version?: string): Promise<CanonStyle> {
    const style = await this.source.load(id);
    if (!style) throw new Error(`canon "${id}" not found in ${this.source.kind} source`);
    return style;
  }
}

// HttpCanonRegistry (remote fetch, strict validation, local caching, offline
// fallback) ships with the registry API — the interface above is its contract.
