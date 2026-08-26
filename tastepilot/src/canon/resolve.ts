import type { BrandDna } from "../ingest/brand-dna.js";
import type { CanonStyle, FontSpec } from "./schema.js";
import { CanonStyleSchema } from "./schema.js";

export type SourceTreatment = "preserve" | "evolve" | "reinvent";

const HEX = /^#[0-9a-fA-F]{6}$/;

function withFamily(spec: FontSpec, family: string): FontSpec {
  // The brand family goes first; the canon's stack becomes the fallback.
  // No googleFont hint: a site font is not necessarily loadable from Google.
  const { googleFont: _dropped, ...rest } = spec;
  void _dropped;
  return { ...rest, family, fallbacks: [spec.family, ...spec.fallbacks] };
}

/**
 * Blend Brand DNA into a canon per the source treatment.
 *
 * preserve — use the brand strongly: colors and font character come from the
 *            source site; the canon supplies editorial grammar.
 * evolve   — recommended default: canon grammar and typography, brand accent.
 * reinvent — the canon takes precedence; only content/assets are preserved.
 */
export function applyBrandDna(
  canon: CanonStyle,
  dna: BrandDna,
  treatment: SourceTreatment,
): CanonStyle {
  if (treatment === "reinvent") return canon;

  const accent = dna.primaryColors.find((c) => HEX.test(c));
  const paper = dna.backgroundColors.find((c) => HEX.test(c));
  const ink = dna.textColors.find((c) => HEX.test(c));

  if (treatment === "evolve") {
    if (!accent) return canon;
    return CanonStyleSchema.parse({
      ...canon,
      palette: {
        ...canon.palette,
        light: { ...canon.palette.light, accent },
      },
    });
  }

  // preserve
  const headlineFamily = dna.headlineFontHints[0];
  const bodyFamily = dna.bodyFontHints[0];
  return CanonStyleSchema.parse({
    ...canon,
    typography: {
      ...canon.typography,
      ...(headlineFamily
        ? {
            title: withFamily(canon.typography.title, headlineFamily),
            heading: withFamily(canon.typography.heading, headlineFamily),
          }
        : {}),
      ...(bodyFamily ? { body: withFamily(canon.typography.body, bodyFamily) } : {}),
    },
    palette: {
      ...canon.palette,
      light: {
        ...canon.palette.light,
        ...(accent ? { accent } : {}),
        ...(paper ? { paper } : {}),
        ...(ink ? { ink } : {}),
      },
    },
  });
}
