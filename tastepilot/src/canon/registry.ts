import type { CanonSource, CanonSourceKind, CanonSummary } from "./load.js";
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

/**
 * Adapts a registry back into a CanonSource, so remote styles fall through the
 * same resolver chain as bundled and local ones — recommendation stays
 * source-neutral, and a remote canon is never privileged over a local one.
 */
export class RegistryCanonSource implements CanonSource {
  constructor(
    readonly kind: CanonSourceKind,
    private readonly registry: CanonRegistry,
  ) {}

  list(): Promise<CanonSummary[]> {
    return this.registry.list();
  }

  async load(id: string): Promise<CanonStyle | undefined> {
    try {
      return await this.registry.fetch(id);
    } catch (err) {
      // A registry that does not have this canon is not an error — the next
      // source may. A registry serving content we refuse is a different story
      // and must not be swallowed by the fall-through.
      if (err instanceof Error && "reason" in err && err.reason === "refused") throw err;
      return undefined;
    }
  }
}
