import type { ContentBlock } from "../semantic/schema.js";
import type { CanonStyle } from "../canon/schema.js";
import type { SectionDirection } from "../art-direction/schema.js";
import { escapeAttr, escapeHtml, renderInline } from "./html.js";

/**
 * Block → semantic HTML. Treatments come from the canon's layout grammar with
 * per-block overrides from the Art Direction Plan — all from controlled
 * vocabularies rendered as class variants. No free-form styling exists here.
 */
export function renderBlock(
  block: ContentBlock,
  canon: CanonStyle,
  direction: SectionDirection | undefined,
): string {
  switch (block.type) {
    case "paragraph": {
      const isPullQuote = direction?.pullQuotes.some((p) => p.blockId === block.id) ?? false;
      // A paragraph can be echoed as a pull quote only when it is short enough
      // to work as one; the paragraph itself always remains in place.
      if (isPullQuote && block.content.text.length <= 240) {
        return `<aside class="pull-quote" aria-label="Pull quote">${renderInline(block.content)}</aside>\n<p id="${block.id}">${renderInline(block.content)}</p>`;
      }
      return `<p id="${block.id}">${renderInline(block.content)}</p>`;
    }
    case "heading": {
      const level = Math.min(Math.max(block.level, 3), 6);
      return `<h${level} id="${block.id}" class="heading heading--${canon.layout.headingTreatment}">${renderInline(block.content)}</h${level}>`;
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items.map((item) => `  <li>${renderInline(item)}</li>`).join("\n");
      return `<${tag} id="${block.id}">\n${items}\n</${tag}>`;
    }
    case "quote": {
      const treatment =
        direction?.pullQuotes.some((p) => p.blockId === block.id) === true
          ? "pull"
          : canon.layout.quoteTreatment;
      if (treatment === "pull") {
        return `<aside class="pull-quote" aria-label="Pull quote">${renderInline(block.content)}</aside>`;
      }
      const attribution = block.attribution
        ? `\n  <footer class="quote-attribution">${escapeHtml(block.attribution)}</footer>`
        : "";
      return `<blockquote id="${block.id}" class="quote quote--${treatment}">\n  <p>${renderInline(block.content)}</p>${attribution}\n</blockquote>`;
    }
    case "statistic": {
      const override = direction?.statistics.find((s) => s.blockId === block.id)?.treatment;
      const treatment = override ?? canon.layout.statisticTreatment;
      const source = block.source
        ? `\n  <span class="statistic-source">${escapeHtml(block.source)}</span>`
        : "";
      return `<figure id="${block.id}" class="statistic statistic--${treatment}">\n  <span class="statistic-value">${escapeHtml(block.value)}</span>\n  <span class="statistic-label">${escapeHtml(block.label)}</span>${source}\n</figure>`;
    }
    case "callout": {
      const override = direction?.callouts.find((c) => c.blockId === block.id)?.treatment;
      const treatment = override ?? canon.layout.calloutTreatment;
      const title = block.title
        ? `\n  <p class="callout-title">${escapeHtml(block.title)}</p>`
        : "";
      return `<aside id="${block.id}" class="callout callout--${treatment}">${title}\n  <p>${renderInline(block.content)}</p>\n</aside>`;
    }
    case "image": {
      const { asset } = block;
      const dims =
        asset.width && asset.height
          ? ` width="${asset.width}" height="${asset.height}"`
          : "";
      return `<figure id="${block.id}" class="image">\n  <img src="${escapeAttr(asset.src)}" alt="${escapeAttr(asset.alt)}"${dims} loading="lazy">\n</figure>`;
    }
    case "caption":
      return `<figcaption id="${block.id}" class="caption" data-for="${escapeAttr(block.for)}">${renderInline(block.content)}</figcaption>`;
    case "table": {
      const header = block.header
        ? `\n  <thead><tr>${block.header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`
        : "";
      const rows = block.rows
        .map((row) => `    <tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("\n");
      return `<div class="table-wrap"><table id="${block.id}">${header}\n  <tbody>\n${rows}\n  </tbody>\n</table></div>`;
    }
    case "divider":
      return `<hr id="${block.id}" class="divider divider--${canon.layout.ornament}">`;
    case "code":
      return `<pre id="${block.id}" class="code"><code${block.language ? ` data-language="${escapeAttr(block.language)}"` : ""}>${escapeHtml(block.text)}</code></pre>`;
    case "button":
      return `<p class="button-row"><a id="${block.id}" class="button" href="${escapeAttr(block.link.href)}">${escapeHtml(block.label)}</a></p>`;
  }
}
