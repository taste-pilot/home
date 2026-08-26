import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SemanticDocument } from "../semantic/schema.js";
import type { CanonStyle } from "../canon/schema.js";
import type { ArtDirectionPlan, SectionDirection } from "../art-direction/schema.js";
import { escapeAttr, escapeHtml } from "./html.js";
import { renderBlock } from "./blocks.js";
import { googleFontsHref, tokensCss } from "./tokens.js";

export interface RenderInputs {
  document: SemanticDocument;
  canon: CanonStyle;
  plan: ArtDirectionPlan;
  /** Artwork id → assets-relative path (e.g. "assets/id.svg"), from the manifest. */
  artworkFiles?: ReadonlyMap<string, string>;
  /** Directory holding the source asset files to copy into the publication. */
  assetsSourceDir?: string;
}

export interface RenderResult {
  outDir: string;
  files: string[];
}

/**
 * THE DETERMINISTIC RENDERER. Same inputs → byte-identical output.
 * No timestamps, no randomness, no network. Exported publications are
 * framework-free semantic HTML + CSS custom properties + tiny vanilla JS.
 */
export async function renderPublication(
  inputs: RenderInputs,
  outDir: string,
): Promise<RenderResult> {
  const { document: doc, canon, plan } = inputs;

  const html = buildHtml(inputs);
  const css = tokensCss(canon) + "\n" + (await baseCss()) + silhouetteCss(inputs);

  await mkdir(join(outDir, "assets"), { recursive: true });
  if (inputs.assetsSourceDir && inputs.artworkFiles) {
    for (const relPath of inputs.artworkFiles.values()) {
      const name = relPath.replace(/^assets\//, "");
      const source = join(inputs.assetsSourceDir, name);
      await copyFile(source, join(outDir, "assets", name));
    }
  }
  await writeFile(join(outDir, "index.html"), html, "utf8");
  await writeFile(join(outDir, "publication.css"), css, "utf8");
  await copyFile(rendererAsset("js", "publication.js"), join(outDir, "publication.js"));
  await writeFile(
    join(outDir, "publication.json"),
    JSON.stringify(
      {
        generator: "tastepilot",
        canon: { id: canon.manifest.id, version: canon.manifest.version },
        plan,
        document: doc,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return {
    outDir,
    files: ["index.html", "publication.css", "publication.js", "publication.json"],
  };
}

function rendererAsset(...parts: string[]): string {
  // renderer/ static assets live at the package root, beside src/ and dist/.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "renderer", ...parts);
}

let baseCssCache: string | undefined;
async function baseCss(): Promise<string> {
  baseCssCache ??= await readFile(rendererAsset("css", "base.css"), "utf8");
  return baseCssCache;
}

/**
 * Text flows around the visible silhouette of transparent artwork where the
 * plan asks for it AND a real asset exists. Rules are generated here — by the
 * deterministic renderer from approved primitives — never by the AI. Browsers
 * without shape support fall back to the rectangular float.
 */
function silhouetteCss(inputs: RenderInputs): string {
  const rules: string[] = [];
  for (const section of inputs.plan.sections) {
    for (const art of section.artwork) {
      const file = inputs.artworkFiles?.get(art.id);
      if (!file || art.wrap !== "silhouette") continue;
      if (art.placement !== "left" && art.placement !== "right") continue;
      rules.push(
        [
          `@media (min-width: 900px) {`,
          `  figure[data-artwork-id="${art.id}"] {`,
          `    shape-outside: url("${file.replace(/"/g, "%22")}");`,
          `    shape-image-threshold: 0.15;`,
          `    shape-margin: 1.1rem;`,
          `  }`,
          `}`,
        ].join("\n"),
      );
    }
  }
  return rules.length > 0 ? "\n/* silhouette wrapping */\n" + rules.join("\n") + "\n" : "";
}

function buildHtml(inputs: RenderInputs): string {
  const { document: doc, canon, plan } = inputs;
  const meta = doc.metadata;
  const fontsHref = googleFontsHref(canon);
  const directions = new Map<string, SectionDirection>(
    plan.sections.map((s) => [s.sectionId, s]),
  );

  const sectionsHtml = doc.sections
    .map((section) => {
      const direction = directions.get(section.id);
      const composition = direction?.composition ?? "standard";
      const classes = ["section", `section--${composition}`];
      const dropCap = direction?.dropCap ?? "none";
      if (dropCap !== "none") classes.push("has-dropcap", `dropcap--${dropCap}`);

      const heading = section.heading
        ? `  <h2 class="section-heading heading--${canon.layout.headingTreatment}">${escapeHtml(section.heading)}</h2>\n`
        : "";

      const artworkHtml = (direction?.artwork ?? [])
        .map((art) => {
          const file = inputs.artworkFiles?.get(art.id);
          const sizeClass = `art--${art.size}`;
          const placementClass = `art--${art.placement}`;
          const wrapClass = art.wrap === "silhouette" ? " art--silhouette" : "";
          if (file) {
            return `  <figure class="art ${placementClass} ${sizeClass}${wrapClass}" data-artwork-id="${escapeAttr(art.id)}">\n    <img src="${escapeAttr(file)}" alt="${escapeAttr(art.brief)}">\n  </figure>`;
          }
          return `  <figure class="art art--placeholder ${placementClass} ${sizeClass}" data-artwork-id="${escapeAttr(art.id)}">\n    <div class="art-brief"><span class="art-brief-label">Artwork</span> ${escapeHtml(art.brief)}</div>\n  </figure>`;
        })
        .join("\n");

      const blocksHtml = section.blocks
        .map((block) => "  " + renderBlock(block, canon, direction).split("\n").join("\n  "))
        .join("\n");

      return `<section class="${classes.join(" ")}" id="section-${escapeAttr(section.id)}" data-motion="${plan.motion}">\n${heading}${artworkHtml ? artworkHtml + "\n" : ""}${blocksHtml}\n</section>`;
    })
    .join("\n\n");

  const byline = [meta.author, doc.source.sourceUrl ?? ""].filter(Boolean);

  return `<!doctype html>
<html lang="${escapeAttr(meta.language)}" data-canon="${escapeAttr(canon.manifest.id)}" data-motion="${plan.motion}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<meta name="generator" content="TastePilot">
${fontsHref ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${fontsHref}">\n` : ""}<link rel="stylesheet" href="publication.css">
</head>
<body>
<div class="theme-control" role="group" aria-label="Color theme" hidden>
  <button type="button" data-theme-choice="light" aria-pressed="false">Light</button>
  <button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button>
  <button type="button" data-theme-choice="auto" aria-pressed="true">Auto</button>
</div>

<header class="pub-header">
${meta.subtitle ? `  <p class="pub-eyebrow">${escapeHtml(meta.subtitle)}</p>\n` : ""}  <h1 class="pub-title">${escapeHtml(meta.title)}</h1>
${byline.length ? `  <p class="pub-byline">${byline.map(escapeHtml).join(" · ")}</p>\n` : ""}</header>

<main class="pub-body">
${sectionsHtml}
</main>

<footer class="pub-footer">
  <hr class="divider divider--${canon.layout.ornament}">
</footer>

<script src="publication.js" defer></script>
</body>
</html>
`;
}
