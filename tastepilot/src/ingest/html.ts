import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ContentBlock, InlineText, Section, SemanticDocument } from "../semantic/schema.js";
import { SemanticDocumentSchema } from "../semantic/schema.js";
import { blockId, sectionId } from "../semantic/ids.js";

/** Elements whose entire subtree is unsafe or non-content. */
const STRIP_ENTIRELY = [
  "script",
  "style",
  "iframe",
  "form",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "canvas",
  "video",
  "audio",
];

/** Non-content chrome removed from the extraction scope. */
const STRIP_CHROME = ["nav", "aside", "header", "footer", "button", "input", "select", "dialog"];

/**
 * Convert an HTML document into a Semantic Document.
 * Extracts meaningful semantic content rather than preserving presentation
 * markup; sanitizes untrusted input; never rewrites the author's words
 * (whitespace is normalized per standard HTML rendering rules).
 */
export function ingestHtml(content: string, location: string): SemanticDocument {
  const $ = cheerio.load(content);

  const author = $('meta[name="author"]').attr("content")?.trim() ?? "";
  const language = $("html").attr("lang")?.trim() || "en";

  // Sanitize everywhere first.
  $(STRIP_ENTIRELY.join(",")).remove();
  for (const el of $("*").toArray()) {
    if (el.type !== "tag") continue;
    for (const attr of Object.keys(el.attribs ?? {})) {
      if (attr.toLowerCase().startsWith("on")) $(el).removeAttr(attr);
    }
    const href = $(el).attr("href");
    if (href && href.trim().toLowerCase().startsWith("javascript:")) $(el).removeAttr("href");
  }

  // Choose the extraction scope, then drop chrome within it.
  const scope = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  scope.find(STRIP_CHROME.join(",")).remove();

  // Title: first h1 in scope (removed from flow), else <title>.
  let title = "";
  const h1 = scope.find("h1").first();
  if (h1.length) {
    title = inlineFromNode($, h1.get(0)!).text;
    h1.remove();
  } else {
    title = $("head > title").text().trim();
  }

  // Walk the scope, splitting sections on h2.
  const taken = new Set<string>();
  const parts: Array<{ heading?: string; elements: Element[] }> = [{ elements: [] }];
  collectContentElements($, scope.get(0)!, (el) => {
    if (el.tagName === "h2") {
      parts.push({ heading: inlineFromNode($, el).text, elements: [] });
    } else {
      parts[parts.length - 1]!.elements.push(el);
    }
  });

  const sections: Section[] = [];
  let sectionIndex = 0;
  for (const part of parts) {
    if (part.elements.length === 0 && part.heading === undefined) continue;
    const id = sectionId(part.heading, sectionIndex, taken);
    const blocks: ContentBlock[] = [];
    for (const el of part.elements) {
      for (const block of elementToBlocks($, el, id, blocks.length, taken)) {
        blocks.push(block);
      }
    }
    const section: Section = { id, blocks };
    if (part.heading !== undefined) section.heading = part.heading;
    sections.push(section);
    sectionIndex += 1;
  }

  return SemanticDocumentSchema.parse({
    schemaVersion: 1,
    metadata: { title, subtitle: "", author, language },
    source: { type: "html", location },
    sections,
  });
}

/** Depth-first walk yielding block-level content elements in reading order. */
function collectContentElements(
  $: cheerio.CheerioAPI,
  root: Element,
  visit: (el: Element) => void,
): void {
  const BLOCK_TAGS = new Set([
    "p",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "blockquote",
    "figure",
    "img",
    "table",
    "hr",
    "pre",
  ]);
  for (const child of $(root).children().toArray()) {
    if (BLOCK_TAGS.has(child.tagName)) {
      visit(child);
    } else if (["div", "section", "article", "main"].includes(child.tagName)) {
      collectContentElements($, child, visit);
    }
  }
}

function elementToBlocks(
  $: cheerio.CheerioAPI,
  el: Element,
  section: string,
  index: number,
  taken: Set<string>,
): ContentBlock[] {
  switch (el.tagName) {
    case "p": {
      const imgs = $(el).children("img");
      if (imgs.length === 1 && inlineFromNode($, el).text === "") {
        return [imageBlock($, imgs.get(0)!, section, index, taken)];
      }
      const content = inlineFromNode($, el);
      if (content.text === "") return [];
      return [{ id: blockId(section, index, "paragraph", taken), type: "paragraph", content }];
    }
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return [
        {
          id: blockId(section, index, "heading", taken),
          type: "heading",
          level: Number(el.tagName.slice(1)),
          content: inlineFromNode($, el),
        },
      ];
    case "ul":
    case "ol": {
      const items = $(el)
        .children("li")
        .toArray()
        .map((li) => inlineFromNode($, li))
        .filter((t) => t.text !== "");
      if (items.length === 0) return [];
      return [
        {
          id: blockId(section, index, "list", taken),
          type: "list",
          ordered: el.tagName === "ol",
          items,
        },
      ];
    }
    case "blockquote": {
      const content = inlineFromNode($, el);
      if (content.text === "") return [];
      return [{ id: blockId(section, index, "quote", taken), type: "quote", content }];
    }
    case "figure": {
      const img = $(el).find("img").first();
      if (!img.length) return [];
      const image = imageBlock($, img.get(0)!, section, index, taken);
      const blocks: ContentBlock[] = [image];
      const figcaption = $(el).find("figcaption").first();
      if (figcaption.length) {
        const content = inlineFromNode($, figcaption.get(0)!);
        if (content.text !== "") {
          blocks.push({
            id: blockId(section, index + 1, "caption", taken),
            type: "caption",
            for: image.id,
            content,
          });
        }
      }
      return blocks;
    }
    case "img":
      return [imageBlock($, el, section, index, taken)];
    case "table": {
      const headerCells = $(el)
        .find("thead th, tr:first-child th")
        .toArray()
        .map((c) => inlineFromNode($, c).text);
      const bodyRows = $(el)
        .find("tbody tr, tr")
        .toArray()
        .filter((tr) => $(tr).children("td").length > 0)
        .map((tr) =>
          $(tr)
            .children("td")
            .toArray()
            .map((c) => inlineFromNode($, c).text),
        );
      if (bodyRows.length === 0) return [];
      return [
        {
          id: blockId(section, index, "table", taken),
          type: "table",
          ...(headerCells.length > 0 ? { header: headerCells } : {}),
          rows: bodyRows,
        },
      ];
    }
    case "hr":
      return [{ id: blockId(section, index, "divider", taken), type: "divider" }];
    case "pre": {
      const code = $(el).children("code").first();
      const text = (code.length ? code.text() : $(el).text()).replace(/\n$/, "");
      const langClass = (code.attr("class") ?? "").match(/language-([\w-]+)/);
      return [
        {
          id: blockId(section, index, "code", taken),
          type: "code",
          ...(langClass ? { language: langClass[1]! } : {}),
          text,
        },
      ];
    }
    default:
      return [];
  }
}

function imageBlock(
  $: cheerio.CheerioAPI,
  img: Element,
  section: string,
  index: number,
  taken: Set<string>,
): Extract<ContentBlock, { type: "image" }> {
  const width = Number($(img).attr("width"));
  const height = Number($(img).attr("height"));
  return {
    id: blockId(section, index, "image", taken),
    type: "image",
    asset: {
      src: $(img).attr("src") ?? "",
      alt: $(img).attr("alt") ?? "",
      ...(Number.isInteger(width) && width > 0 ? { width } : {}),
      ...(Number.isInteger(height) && height > 0 ? { height } : {}),
    },
  };
}

/**
 * Build an InlineText from an element's descendants, collapsing whitespace
 * per HTML rendering rules while recording link and mark offsets.
 */
function inlineFromNode($: cheerio.CheerioAPI, root: AnyNode): InlineText {
  const acc: InlineText = { text: "", links: [], marks: [] };

  const append = (raw: string) => {
    let chunk = raw.replace(/\s+/g, " ");
    if (chunk === "") return;
    if (acc.text === "" || acc.text.endsWith(" ")) chunk = chunk.replace(/^ /, "");
    acc.text += chunk;
  };

  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      append(node.data);
      return;
    }
    if (node.type !== "tag") return;
    const el = node;
    const tag = el.tagName;
    if (tag === "br") {
      acc.text = acc.text.replace(/ $/, "") + "\n";
      return;
    }
    if (tag === "img") {
      append($(el).attr("alt") ?? "");
      return;
    }
    const start = acc.text.length;
    for (const child of el.children) walk(child);
    const end = acc.text.replace(/ $/, "").length;
    if (end <= start) return;
    if (tag === "a") {
      const href = $(el).attr("href");
      if (href) acc.links.push({ start, end, href });
    } else if (tag === "em" || tag === "i") {
      acc.marks.push({ start, end, kind: "em" });
    } else if (tag === "strong" || tag === "b") {
      acc.marks.push({ start, end, kind: "strong" });
    } else if (tag === "code") {
      acc.marks.push({ start, end, kind: "code" });
    }
  };

  if (root.type === "tag") {
    for (const child of root.children) walk(child);
  }
  acc.text = acc.text.replace(/\s+$/, "").replace(/^\s+/, "");
  return acc;
}
