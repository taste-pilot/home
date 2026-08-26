import { z } from "zod";

/**
 * The Semantic Document is TastePilot's normalized internal format, independent
 * of source. It describes MEANING, never appearance: no styling decisions may
 * ever live here. All schemas are strict — unknown keys are rejected so
 * presentation concerns cannot ride through.
 */

/** Stable, unique identifier. Deterministic per document position/content. */
export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase alphanumerics and hyphens");

export const LinkSchema = z
  .object({
    href: z.string().min(1),
    title: z.string().optional(),
  })
  .strict();

export const ImageAssetSchema = z
  .object({
    /** Path or URL to the image as found in the source. */
    src: z.string().min(1),
    alt: z.string().default(""),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Inline content is stored as plain text plus optional link annotations.
 * Prose is sacred: `text` must survive ingestion byte-identical.
 */
export const InlineTextSchema = z
  .object({
    text: z.string(),
    links: z
      .array(
        z
          .object({
            /** Character offsets into `text`. */
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
            href: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

const blockBase = {
  id: IdSchema,
};

export const ParagraphBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("paragraph"),
    content: InlineTextSchema,
  })
  .strict();

export const HeadingBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("heading"),
    /** Semantic level within the document, 1 (title-level) through 6. */
    level: z.number().int().min(1).max(6),
    content: InlineTextSchema,
  })
  .strict();

export const ListBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(InlineTextSchema).min(1),
  })
  .strict();

export const QuoteBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("quote"),
    content: InlineTextSchema,
    attribution: z.string().optional(),
  })
  .strict();

export const StatisticBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("statistic"),
    /** The figure itself, e.g. "87%" or "4.2M". */
    value: z.string().min(1),
    /** What the figure means, verbatim from the source. */
    label: z.string(),
    source: z.string().optional(),
  })
  .strict();

export const CalloutBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("callout"),
    content: InlineTextSchema,
    title: z.string().optional(),
  })
  .strict();

export const ImageBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("image"),
    asset: ImageAssetSchema,
  })
  .strict();

export const CaptionBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("caption"),
    /** The block this caption belongs to (usually an image or table). */
    for: IdSchema,
    content: InlineTextSchema,
  })
  .strict();

export const TableBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("table"),
    header: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).min(1),
  })
  .strict();

export const DividerBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("divider"),
  })
  .strict();

export const ButtonBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal("button"),
    label: z.string().min(1),
    link: LinkSchema,
  })
  .strict();

export const ContentBlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  ListBlockSchema,
  QuoteBlockSchema,
  StatisticBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  CaptionBlockSchema,
  TableBlockSchema,
  DividerBlockSchema,
  ButtonBlockSchema,
]);

export const SectionSchema = z
  .object({
    id: IdSchema,
    heading: z.string().optional(),
    blocks: z.array(ContentBlockSchema),
  })
  .strict();

export const DocumentSourceSchema = z
  .object({
    type: z.enum(["text", "markdown", "html", "url"]),
    /** File path or URL the document came from. */
    location: z.string().min(1),
    sourceUrl: z.string().url().optional(),
    capturedAt: z.string().datetime().optional(),
  })
  .strict();

export const DocumentMetadataSchema = z
  .object({
    title: z.string(),
    subtitle: z.string().default(""),
    author: z.string().default(""),
    language: z.string().default("en"),
  })
  .strict();

export const SemanticDocumentSchema = z
  .object({
    /** Schema version for forward migration. */
    schemaVersion: z.literal(1),
    metadata: DocumentMetadataSchema,
    source: DocumentSourceSchema,
    sections: z.array(SectionSchema),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    for (const section of doc.sections) {
      if (seen.has(section.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate section id "${section.id}"`,
        });
      }
      seen.add(section.id);
      for (const block of section.blocks) {
        if (seen.has(block.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate block id "${block.id}"`,
          });
        }
        seen.add(block.id);
      }
    }
  });

export type Link = z.infer<typeof LinkSchema>;
export type ImageAsset = z.infer<typeof ImageAssetSchema>;
export type InlineText = z.infer<typeof InlineTextSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type SemanticDocument = z.infer<typeof SemanticDocumentSchema>;
