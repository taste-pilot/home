import type { CanonStyle, FontSpec, PaletteTokens } from "../canon/schema.js";

/**
 * Canon → CSS custom properties. Pure and deterministic: the same canon
 * always produces the same bytes. This is the ONLY place canon values become
 * CSS — the renderer never accepts free-form styles from anywhere else.
 */

function stack(font: FontSpec): string {
  const names = [font.family, ...font.fallbacks];
  return names.map((n) => (/[ ]/.test(n) ? `"${n}"` : n)).join(", ");
}

function paletteVars(p: PaletteTokens): string[] {
  return [
    `--paper: ${p.paper};`,
    `--ink: ${p.ink};`,
    `--ink-soft: ${p.inkSoft};`,
    `--accent: ${p.accent};`,
    `--rule: ${p.rule};`,
    `--panel: ${p.panel};`,
    `--code-bg: ${p.codeBg};`,
    `--code-ink: ${p.codeInk};`,
  ];
}

const RADII = { none: "0", subtle: "6px", round: "16px" } as const;
const DENSITY_SPACE = {
  airy: { block: "1.9rem", section: "5.5rem" },
  comfortable: { block: "1.5rem", section: "4rem" },
  compact: { block: "1.1rem", section: "2.75rem" },
} as const;

function round3(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/** Build the token stylesheet for a canon (both palettes, three theme states). */
export function tokensCss(canon: CanonStyle): string {
  const t = canon.typography;
  const l = canon.layout;
  const space = DENSITY_SPACE[l.density];
  const scale = (steps: number) => round3(t.baseSizeRem * Math.pow(t.scaleRatio, steps));

  const base = [
    ...paletteVars(canon.palette.light),
    `--font-title: ${stack(t.title)};`,
    `--font-heading: ${stack(t.heading)};`,
    `--font-body: ${stack(t.body)};`,
    `--font-utility: ${stack(t.utility)};`,
    `--size-base: ${round3(t.baseSizeRem)}rem;`,
    `--size-small: ${scale(-1)}rem;`,
    `--size-h3: ${scale(1)}rem;`,
    `--size-h2: ${scale(2)}rem;`,
    `--size-title: ${scale(4)}rem;`,
    `--size-statistic: ${scale(3)}rem;`,
    `--leading-body: ${round3(t.bodyLeading)};`,
    `--leading-heading: ${round3(t.headingLeading)};`,
    `--measure: ${l.measureCh}ch;`,
    `--space-block: ${space.block};`,
    `--space-section: ${space.section};`,
    `--radius: ${RADII[l.cornerRadius]};`,
  ];

  const dark = paletteVars(canon.palette.dark);
  const indent = (lines: string[], pad: string) => lines.map((x) => pad + x).join("\n");

  return [
    ":root {",
    indent(base, "  "),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    indent(dark, "    "),
    "  }",
    "}",
    "",
    ':root[data-theme="dark"] {',
    indent(dark, "  "),
    "}",
    "",
  ].join("\n");
}

/** Google Fonts stylesheet URL for the canon (progressive enhancement only). */
export function googleFontsHref(canon: CanonStyle): string | undefined {
  const fonts = new Map<string, Set<number>>();
  for (const spec of [
    canon.typography.title,
    canon.typography.heading,
    canon.typography.body,
    canon.typography.utility,
  ]) {
    if (!spec.googleFont) continue;
    const weights = fonts.get(spec.googleFont) ?? new Set<number>();
    for (const w of spec.weights) weights.add(w);
    fonts.set(spec.googleFont, weights);
  }
  if (fonts.size === 0) return undefined;
  const families = [...fonts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, weights]) => {
      const w = [...weights].sort((a, b) => a - b).join(";");
      return `family=${name.replace(/ /g, "+")}:wght@${w}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
