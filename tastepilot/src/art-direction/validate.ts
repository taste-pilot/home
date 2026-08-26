import type { SemanticDocument } from "../semantic/schema.js";
import { ArtDirectionPlanSchema, type ArtDirectionPlan } from "./schema.js";

export interface PlanValidationResult {
  ok: boolean;
  plan?: ArtDirectionPlan;
  /** Actionable, human/agent-readable failure messages. */
  errors: string[];
}

/** Validate plan JSON on its own. */
export function validatePlan(raw: unknown): PlanValidationResult {
  const parsed = ArtDirectionPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.join(".") || "(root)";
        const hint =
          issue.code === "unrecognized_keys"
            ? " — the plan may only use the approved vocabulary; arbitrary properties (including CSS) are rejected"
            : "";
        return `${path}: ${issue.message}${hint}`;
      }),
    };
  }
  return { ok: true, plan: parsed.data, errors: [] };
}

/** Validate a plan against the document it directs. */
export function validatePlanAgainstDocument(
  raw: unknown,
  doc: SemanticDocument,
): PlanValidationResult {
  const base = validatePlan(raw);
  if (!base.ok || !base.plan) return base;

  const errors: string[] = [];
  const sectionIds = new Set(doc.sections.map((s) => s.id));
  const blockIds = new Set(doc.sections.flatMap((s) => s.blocks.map((b) => b.id)));

  for (const direction of base.plan.sections) {
    if (!sectionIds.has(direction.sectionId)) {
      errors.push(
        `sections: "${direction.sectionId}" does not exist in the document. ` +
          `Known sections: ${[...sectionIds].join(", ")}`,
      );
    }
    for (const pq of direction.pullQuotes) {
      if (!blockIds.has(pq.blockId)) {
        errors.push(`pullQuotes: block "${pq.blockId}" does not exist in the document`);
      }
    }
    for (const stat of direction.statistics) {
      if (!blockIds.has(stat.blockId)) {
        errors.push(`statistics: block "${stat.blockId}" does not exist in the document`);
      }
    }
    for (const callout of direction.callouts) {
      if (!blockIds.has(callout.blockId)) {
        errors.push(`callouts: block "${callout.blockId}" does not exist in the document`);
      }
    }
    for (const art of direction.artwork) {
      if (art.nearBlockId && !blockIds.has(art.nearBlockId)) {
        errors.push(`artwork "${art.id}": nearBlockId "${art.nearBlockId}" does not exist`);
      }
    }
  }

  const directed = new Set(base.plan.sections.map((s) => s.sectionId));
  for (const id of sectionIds) {
    if (!directed.has(id)) {
      errors.push(
        `sections: document section "${id}" has no direction — every section needs one ` +
          `(use composition "standard" or "quiet-section" when nothing special should happen)`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return base;
}
