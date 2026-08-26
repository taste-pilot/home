import { z } from "zod";
import { DropCapKindSchema, MotionLevelSchema } from "../canon/schema.js";
import { IdSchema } from "../semantic/schema.js";

/**
 * The Art Direction Plan is the contract between the host agent (acting as
 * Art Director) and the deterministic renderer. It contains EDITORIAL
 * DECISIONS chosen from controlled vocabularies — never CSS. All schemas are
 * strict so nothing outside the approved vocabulary can ride through.
 */

export const CompositionChoiceSchema = z.enum([
  "standard",
  "opening-editorial",
  "margin-art-left",
  "margin-art-right",
  "full-width-art",
  "pull-quote-break",
  "statistic-break",
  "two-column-callout",
  "quiet-section",
  "diagram-section",
]);

export const ArtworkPlacementSchema = z.enum(["left", "right", "full", "background", "inline"]);
export const ArtworkWrapSchema = z.enum(["none", "rectangle", "silhouette"]);
export const ArtworkSizeSchema = z.enum(["small", "medium", "large"]);

export const ArtworkRequestSchema = z
  .object({
    /** Stable id — the artwork manifest tracks this asset across redesigns. */
    id: IdSchema,
    placement: ArtworkPlacementSchema,
    wrap: ArtworkWrapSchema,
    size: ArtworkSizeSchema,
    /** The editorial brief for the artwork planner/provider. */
    brief: z.string().min(1),
    /** Anchor block: artwork appears near this block when placement allows. */
    nearBlockId: IdSchema.optional(),
  })
  .strict();

export const StatisticTreatmentSchema = z
  .object({
    blockId: IdSchema,
    treatment: z.enum(["inline", "oversized", "panel"]),
  })
  .strict();

export const CalloutTreatmentSchema = z
  .object({
    blockId: IdSchema,
    treatment: z.enum(["panel", "rule-left", "boxed"]),
  })
  .strict();

export const PullQuoteSchema = z
  .object({
    /** The quote (or paragraph) block elevated into a pull quote. */
    blockId: IdSchema,
  })
  .strict();

export const SectionDirectionSchema = z
  .object({
    sectionId: IdSchema,
    composition: CompositionChoiceSchema,
    dropCap: DropCapKindSchema.optional(),
    artwork: z.array(ArtworkRequestSchema).default([]),
    pullQuotes: z.array(PullQuoteSchema).default([]),
    statistics: z.array(StatisticTreatmentSchema).default([]),
    callouts: z.array(CalloutTreatmentSchema).default([]),
  })
  .strict();

export const ArtDirectionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Canon id this plan was directed for. */
    style: z.string().min(1),
    artDensity: z.enum(["none", "light", "medium", "rich"]),
    motion: MotionLevelSchema,
    sections: z.array(SectionDirectionSchema).min(1),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const seen = new Set<string>();
    for (const section of plan.sections) {
      if (seen.has(section.sectionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate section direction for "${section.sectionId}"`,
        });
      }
      seen.add(section.sectionId);
    }
    const artIds = new Set<string>();
    for (const section of plan.sections) {
      for (const art of section.artwork) {
        if (artIds.has(art.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate artwork id "${art.id}"`,
          });
        }
        artIds.add(art.id);
      }
    }
  });

export type CompositionChoice = z.infer<typeof CompositionChoiceSchema>;
export type ArtworkRequest = z.infer<typeof ArtworkRequestSchema>;
export type SectionDirection = z.infer<typeof SectionDirectionSchema>;
export type ArtDirectionPlan = z.infer<typeof ArtDirectionPlanSchema>;
