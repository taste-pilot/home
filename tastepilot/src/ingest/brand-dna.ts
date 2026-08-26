import { z } from "zod";
import type { Page } from "playwright";

/**
 * Brand DNA: the reusable visual identity extracted from an existing webpage.
 * Used by Preserve/Evolve source treatments; later saveable as a House Style.
 */
export const BrandDnaSchema = z
  .object({
    sourceUrl: z.string().url(),
    primaryColors: z.array(z.string()).default([]),
    backgroundColors: z.array(z.string()).default([]),
    textColors: z.array(z.string()).default([]),
    headlineFontHints: z.array(z.string()).default([]),
    bodyFontHints: z.array(z.string()).default([]),
    borderRadius: z.string().default("0px"),
    buttonTreatment: z
      .object({
        background: z.string(),
        color: z.string(),
        borderRadius: z.string(),
      })
      .strict()
      .optional(),
    logoCandidate: z.string().optional(),
    density: z.enum(["airy", "comfortable", "compact"]).default("comfortable"),
  })
  .strict();

export type BrandDna = z.infer<typeof BrandDnaSchema>;

/** Convert "rgb(a, b, c)" / "rgba(...)" to #rrggbb; pass hex through. */
export function cssColorToHex(color: string): string | undefined {
  const hex = color.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (hex) return `#${hex[1]!.toLowerCase()}`;
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!rgb) return undefined;
  const toHex = (v: string) => Number(v).toString(16).padStart(2, "0");
  return `#${toHex(rgb[1]!)}${toHex(rgb[2]!)}${toHex(rgb[3]!)}`;
}

function firstFamily(fontFamily: string): string {
  const first = fontFamily.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "");
}

/** Sample computed styles from representative elements of the rendered page. */
export async function extractBrandDna(page: Page, sourceUrl: string): Promise<BrandDna> {
  const raw = await page.evaluate(() => {
    const style = (el: Element | null) => (el ? getComputedStyle(el) : undefined);
    const body = style(document.body);
    const h1 = style(document.querySelector("h1, h2"));
    const link = style(document.querySelector("main a[href], article a[href], a[href]"));
    const buttonEl = document.querySelector(
      'button, .button, [class*="btn"], input[type="submit"]',
    );
    const button = style(buttonEl);
    const logo = document.querySelector<HTMLImageElement>(
      'header img, [class*="logo"] img, img[alt*="logo" i]',
    );
    const paragraphs = document.querySelectorAll("p").length;
    const height = document.body.scrollHeight || 1;
    return {
      bodyBackground: body?.backgroundColor ?? "",
      bodyColor: body?.color ?? "",
      bodyFont: body?.fontFamily ?? "",
      headlineColor: h1?.color ?? "",
      headlineFont: h1?.fontFamily ?? "",
      linkColor: link?.color ?? "",
      buttonBackground: button?.backgroundColor ?? "",
      buttonColor: button?.color ?? "",
      buttonRadius: button?.borderRadius ?? "",
      logoSrc: logo?.src ?? "",
      paragraphsPerViewport: paragraphs / Math.max(1, height / 900),
    };
  });

  const colors = (values: Array<string | undefined>) =>
    [...new Set(values.map((v) => (v ? cssColorToHex(v) : undefined)).filter(Boolean))] as string[];

  const density =
    raw.paragraphsPerViewport > 8
      ? "compact"
      : raw.paragraphsPerViewport > 4
        ? "comfortable"
        : "airy";

  const buttonBg = cssColorToHex(raw.buttonBackground);
  const buttonInk = cssColorToHex(raw.buttonColor);

  return BrandDnaSchema.parse({
    sourceUrl,
    primaryColors: colors([raw.linkColor, raw.buttonBackground, raw.headlineColor]),
    backgroundColors: colors([raw.bodyBackground]),
    textColors: colors([raw.bodyColor, raw.headlineColor]),
    headlineFontHints: raw.headlineFont ? [firstFamily(raw.headlineFont)] : [],
    bodyFontHints: raw.bodyFont ? [firstFamily(raw.bodyFont)] : [],
    borderRadius: raw.buttonRadius || "0px",
    ...(buttonBg && buttonInk
      ? {
          buttonTreatment: {
            background: buttonBg,
            color: buttonInk,
            borderRadius: raw.buttonRadius || "0px",
          },
        }
      : {}),
    ...(raw.logoSrc ? { logoCandidate: raw.logoSrc } : {}),
    density,
  });
}
