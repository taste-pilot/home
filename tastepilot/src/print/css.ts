import type { CanonStyle, PaletteTokens } from "../canon/schema.js";

/**
 * Print composition CSS, generated per canon from its PrintGrammar.
 * The PDF is a composed print edition, never a screenshot: animations are
 * neutralized, revealed, and nothing is clipped or left invisible.
 */
export function printCss(canon: CanonStyle): string {
  const p = canon.print;
  const size = p.pageSize === "a4" ? "A4" : "letter";
  const background = p.background === "white" ? "#ffffff" : "var(--paper)";
  const light = canon.palette.light;

  const lightVars = (tokens: PaletteTokens) =>
    [
      `    --paper: ${tokens.paper};`,
      `    --ink: ${tokens.ink};`,
      `    --ink-soft: ${tokens.inkSoft};`,
      `    --accent: ${tokens.accent};`,
      `    --rule: ${tokens.rule};`,
      `    --panel: ${tokens.panel};`,
      `    --code-bg: ${tokens.codeBg};`,
      `    --code-ink: ${tokens.codeInk};`,
    ].join("\n");

  return `
/* print composition */
@page {
  size: ${size};
}

@media print {
  /* Print always uses the light palette, whatever the reader chose on screen. */
  :root, :root[data-theme="dark"] {
${lightVars(light)}
  }

  html { background: #ffffff; }
  body {
    background: ${background};
    font-size: calc(var(--size-base) * ${p.fontScale});
  }

  /* Nothing animates, nothing stays hidden, nothing sticks. */
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .motion-hidden { opacity: 1 !important; transform: none !important; }
  .theme-control { display: none !important; }

  /* Sensible page breaks. */
  p { orphans: 3; widows: 3; }
  h2, h3, h4, .section-heading { break-after: avoid; }
  figure, blockquote, table, .callout, .statistic, .code, .art, .pull-quote {
    break-inside: avoid;
  }
  .caption { break-before: avoid; }
  .image { break-inside: avoid; }

  /* Print-safe treatment. */
  a { color: inherit; }
  .pub-header { padding-top: 0; }
  .table-wrap { overflow: visible; }
  .code { white-space: pre-wrap; word-break: break-word; }
}
`;
}
