/**
 * The Art Direction Plan is the contract between the host agent (acting as
 * Art Director) and the deterministic renderer. The agent produces structured
 * editorial decisions validated against a strict schema — NEVER arbitrary CSS.
 * Schemas arrive in milestone M3.
 */

export function validateArtDirectionPlan(_plan: unknown): never {
  throw new Error("not implemented yet: the Art Direction Plan contract arrives in milestone M3");
}
