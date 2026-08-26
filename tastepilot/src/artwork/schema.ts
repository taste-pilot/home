import { z } from "zod";
import { IdSchema } from "../semantic/schema.js";

/**
 * Artwork is DURABLE. Once created and approved it persists as a project
 * asset. Changing canon, palette, fonts, or layout must never delete or
 * regenerate approved artwork — regeneration happens only when the user asks.
 */

export const ArtworkStatusSchema = z.enum([
  "planned",
  "available",
  "approved",
  "missing",
  "failed",
]);

export const ArtworkItemSchema = z
  .object({
    id: IdSchema,
    sectionId: IdSchema,
    /** What this artwork is for, editorially. */
    purpose: z.string(),
    /** The generation brief/prompt used (or to be used). */
    prompt: z.string(),
    /** File path relative to the project assets directory, once it exists. */
    file: z.string().optional(),
    /** Which provider produced it ("existing-asset", "placeholder", ...). */
    provider: z.string().optional(),
    status: ArtworkStatusSchema,
    approved: z.boolean().default(false),
    /** Explicit opt-in only — reuse is always the default. */
    regenerate: z.boolean().default(false),
    createdAt: z.string().datetime().optional(),
  })
  .strict();

export const ArtworkManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    items: z.array(ArtworkItemSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const item of manifest.items) {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate artwork id "${item.id}"`,
        });
      }
      seen.add(item.id);
    }
  });

export type ArtworkStatus = z.infer<typeof ArtworkStatusSchema>;
export type ArtworkItem = z.infer<typeof ArtworkItemSchema>;
export type ArtworkManifest = z.infer<typeof ArtworkManifestSchema>;
