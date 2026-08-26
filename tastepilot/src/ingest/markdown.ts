import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, Blockquote, List, Table } from "mdast";
import type { ContentBlock, InlineText, Section, SemanticDocument } from "../semantic/schema.js";
import { SemanticDocumentSchema } from "../semantic/schema.js";
import { blockId, sectionId } from "../semantic/ids.js";
import { flattenPhrasing } from "./inline.js";

const parser = unified().use(remarkParse).use(remarkGfm);

/**
 * Convert Markdown into a Semantic Document.
 *
 * Structural conventions:
 * - the first level-1 heading becomes the document title
 * - level-1/2 headings start new sections; deeper headings stay as blocks
 * - prose is never rewritten — text nodes are carried through verbatim
 */
export function ingestMarkdown(content: string, location: string): SemanticDocument {
  const tree = parser.parse(content) as Root;

  let title = "";
  const takenIds = new Set<string>();
  const sections: Section[] = [];
  let current: { heading?: string; nodes: RootContent[] } = { nodes: [] };
  const pending: Array<{ heading?: string; nodes: RootContent[] }> = [];

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 1 && title === "") {
      title = flattenPhrasing(node.children).text;
      continue;
    }
    if (node.type === "heading" && node.depth <= 2) {
      pending.push(current);
      current = { heading: flattenPhrasing(node.children).text, nodes: [] };
      continue;
    }
    current.nodes.push(node);
  }
  pending.push(current);

  let sectionIndex = 0;
  for (const part of pending) {
    if (part.nodes.length === 0 && part.heading === undefined) continue;
    const id = sectionId(part.heading, sectionIndex, takenIds);
    const blocks: ContentBlock[] = [];
    for (const node of part.nodes) {
      for (const block of nodeToBlocks(node, id, blocks.length, takenIds)) {
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
    metadata: { title, subtitle: "", author: "", language: "en" },
    source: { type: "markdown", location },
    sections,
  });
}

function nodeToBlocks(
  node: RootContent,
  section: string,
  index: number,
  taken: Set<string>,
): ContentBlock[] {
  switch (node.type) {
    case "paragraph": {
      const children = node.children;
      if (children.length === 1 && children[0]!.type === "image") {
        const image = children[0]!;
        return [
          {
            id: blockId(section, index, "image", taken),
            type: "image",
            asset: { src: image.url, alt: image.alt ?? "" },
          },
        ];
      }
      return [
        {
          id: blockId(section, index, "paragraph", taken),
          type: "paragraph",
          content: flattenPhrasing(children),
        },
      ];
    }
    case "heading":
      return [
        {
          id: blockId(section, index, "heading", taken),
          type: "heading",
          level: node.depth,
          content: flattenPhrasing(node.children),
        },
      ];
    case "list":
      return [
        {
          id: blockId(section, index, "list", taken),
          type: "list",
          ordered: node.ordered === true,
          items: listItems(node),
        },
      ];
    case "blockquote":
      return [
        {
          id: blockId(section, index, "quote", taken),
          type: "quote",
          content: quoteContent(node),
        },
      ];
    case "code":
      return [
        {
          id: blockId(section, index, "code", taken),
          type: "code",
          ...(node.lang ? { language: node.lang } : {}),
          text: node.value,
        },
      ];
    case "table":
      return [tableBlock(node, blockId(section, index, "table", taken))];
    case "thematicBreak":
      return [{ id: blockId(section, index, "divider", taken), type: "divider" }];
    case "html":
      // Raw HTML islands in Markdown are presentation-layer; skipped.
      return [];
    default:
      return [];
  }
}

function listItems(node: List): InlineText[] {
  const items: InlineText[] = [];
  for (const item of node.children) {
    const texts: InlineText[] = [];
    for (const child of item.children) {
      if (child.type === "paragraph") texts.push(flattenPhrasing(child.children));
    }
    items.push(joinInline(texts, "\n"));
  }
  return items;
}

function quoteContent(node: Blockquote): InlineText {
  const texts: InlineText[] = [];
  for (const child of node.children) {
    if (child.type === "paragraph") texts.push(flattenPhrasing(child.children));
  }
  return joinInline(texts, "\n\n");
}

function joinInline(parts: InlineText[], separator: string): InlineText {
  const acc: InlineText = { text: "", links: [], marks: [] };
  for (const part of parts) {
    if (acc.text.length > 0) acc.text += separator;
    const offset = acc.text.length;
    acc.text += part.text;
    for (const link of part.links) {
      acc.links.push({ ...link, start: link.start + offset, end: link.end + offset });
    }
    for (const mark of part.marks) {
      acc.marks.push({ ...mark, start: mark.start + offset, end: mark.end + offset });
    }
  }
  return acc;
}

function tableBlock(node: Table, id: string): ContentBlock {
  const allRows = node.children.map((row) =>
    row.children.map((cell) => flattenPhrasing(cell.children).text),
  );
  const [header, ...rest] = allRows;
  return {
    id,
    type: "table",
    ...(header ? { header } : {}),
    rows: rest.length > 0 ? rest : [[]],
  };
}
