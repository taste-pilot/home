import { z } from "zod";

/**
 * A Canon style is a reusable editorial grammar, NOT a page template.
 * Every schema is strict: unknown keys are rejected, so a Canon can never
 * smuggle arbitrary CSS, scripts, or agent instructions into the renderer.
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colors are 6-digit hex");

export const CanonTierSchema = z.enum(["starter", "community", "certified", "library"]);

export const DropCapKindSchema = z.enum([
  "none",
  "classic-3",
  "classic-5",
  "raised",
  "sunken",
  "outline",
  "background",
  "margin",
  "sculptural",
]);

export const MotionLevelSchema = z.enum(["none", "gentle", "editorial", "cinematic"]);

export const DropCapGrammarSchema = z
  .object({
    preferred: DropCapKindSchema,
    allowed: z.array(DropCapKindSchema).min(1),
  })
  .strict();

export const ArtworkGrammarSchema = z
  .object({
    density: z.enum(["none", "light", "medium", "rich"]),
    /** Prose description of the illustration tradition, used in art briefs. */
    style: z.string(),
    wrapAllowed: z.boolean(),
    placements: z.array(z.enum(["left", "right", "full", "background", "inline"])).min(1),
  })
  .strict();

export const CanonManifestSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .max(64),
    name: z.string().min(1),
    author: z.string().min(1),
    homepage: z.string().url().optional(),
    license: z.string().min(1),
    basedOn: z.string().optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    tier: CanonTierSchema,
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    dropCaps: DropCapGrammarSchema,
    artwork: ArtworkGrammarSchema,
  })
  .strict();

export const FontSpecSchema = z
  .object({
    family: z.string().min(1),
    /** Full fallback stack — publications must read fine fully offline. */
    fallbacks: z.array(z.string().min(1)).min(1),
    /** Family name on Google Fonts when loadable as progressive enhancement. */
    googleFont: z.string().optional(),
    weights: z.array(z.number().int().min(100).max(900)).min(1),
  })
  .strict();

export const TypographySystemSchema = z
  .object({
    /** How many distinct families this canon uses (1–3). */
    fontCount: z.number().int().min(1).max(3),
    title: FontSpecSchema,
    heading: FontSpecSchema,
    body: FontSpecSchema,
    utility: FontSpecSchema,
    /** Base body size in rem and the modular scale ratio. */
    baseSizeRem: z.number().min(0.8).max(1.5),
    scaleRatio: z.number().min(1.05).max(1.8),
    bodyLeading: z.number().min(1.2).max(2),
    headingLeading: z.number().min(0.9).max(1.6),
  })
  .strict();

export const PaletteTokensSchema = z
  .object({
    paper: hexColor,
    ink: hexColor,
    inkSoft: hexColor,
    accent: hexColor,
    rule: hexColor,
    panel: hexColor,
    codeBg: hexColor,
    codeInk: hexColor,
  })
  .strict();

export const PaletteSystemSchema = z
  .object({
    /** Paired light/dark design tokens — never simple inversion. */
    light: PaletteTokensSchema,
    dark: PaletteTokensSchema,
  })
  .strict();

export const LayoutGrammarSchema = z
  .object({
    /** Reading measure in characters. */
    measureCh: z.number().int().min(45).max(90),
    density: z.enum(["airy", "comfortable", "compact"]),
    headingTreatment: z.enum(["plain", "eyebrow", "numbered", "underlined"]),
    quoteTreatment: z.enum(["rule-left", "oversized-mark", "centered-italic", "indent"]),
    calloutTreatment: z.enum(["panel", "rule-left", "boxed"]),
    statisticTreatment: z.enum(["inline", "oversized", "panel"]),
    ornament: z.enum(["none", "rule", "fleuron", "asterism"]),
    cornerRadius: z.enum(["none", "subtle", "round"]),
  })
  .strict();

export const MotionGrammarSchema = z
  .object({
    default: MotionLevelSchema,
    max: MotionLevelSchema,
    reveal: z.enum(["none", "fade", "rise"]),
  })
  .strict();

export const PrintGrammarSchema = z
  .object({
    pageSize: z.enum(["letter", "a4"]),
    marginsMm: z
      .object({
        top: z.number().min(8).max(40),
        bottom: z.number().min(8).max(40),
        inner: z.number().min(8).max(40),
        outer: z.number().min(8).max(40),
      })
      .strict(),
    showFolios: z.boolean(),
    /** Print body size relative to screen (1 = same). */
    fontScale: z.number().min(0.7).max(1.2),
    background: z.enum(["white", "paper-tint"]),
  })
  .strict();

/** The fully assembled Canon style. */
export const CanonStyleSchema = z
  .object({
    manifest: CanonManifestSchema,
    typography: TypographySystemSchema,
    palette: PaletteSystemSchema,
    layout: LayoutGrammarSchema,
    motion: MotionGrammarSchema,
    print: PrintGrammarSchema,
  })
  .strict();

export type CanonTier = z.infer<typeof CanonTierSchema>;
export type DropCapKind = z.infer<typeof DropCapKindSchema>;
export type MotionLevel = z.infer<typeof MotionLevelSchema>;
export type CanonManifest = z.infer<typeof CanonManifestSchema>;
export type FontSpec = z.infer<typeof FontSpecSchema>;
export type TypographySystem = z.infer<typeof TypographySystemSchema>;
export type PaletteTokens = z.infer<typeof PaletteTokensSchema>;
export type PaletteSystem = z.infer<typeof PaletteSystemSchema>;
export type LayoutGrammar = z.infer<typeof LayoutGrammarSchema>;
export type MotionGrammar = z.infer<typeof MotionGrammarSchema>;
export type PrintGrammar = z.infer<typeof PrintGrammarSchema>;
export type CanonStyle = z.infer<typeof CanonStyleSchema>;
