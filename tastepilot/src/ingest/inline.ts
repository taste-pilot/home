import type { PhrasingContent } from "mdast";
import type { InlineText } from "../semantic/schema.js";

/**
 * Flatten mdast phrasing content into an InlineText: plain text plus link and
 * mark annotations over character offsets. The author's words are appended
 * verbatim — soft line breaks in the source survive as "\n".
 */
export function flattenPhrasing(nodes: ReadonlyArray<PhrasingContent>): InlineText {
  const out: { text: string; links: InlineText["links"]; marks: InlineText["marks"] } = {
    text: "",
    links: [],
    marks: [],
  };
  appendNodes(nodes, out);
  return out;
}

type Acc = { text: string; links: InlineText["links"]; marks: InlineText["marks"] };

function appendNodes(nodes: ReadonlyArray<PhrasingContent>, acc: Acc): void {
  for (const node of nodes) {
    appendNode(node, acc);
  }
}

function appendNode(node: PhrasingContent, acc: Acc): void {
  switch (node.type) {
    case "text":
      acc.text += node.value;
      return;
    case "inlineCode": {
      const start = acc.text.length;
      acc.text += node.value;
      acc.marks.push({ start, end: acc.text.length, kind: "code" });
      return;
    }
    case "emphasis": {
      const start = acc.text.length;
      appendNodes(node.children, acc);
      acc.marks.push({ start, end: acc.text.length, kind: "em" });
      return;
    }
    case "strong": {
      const start = acc.text.length;
      appendNodes(node.children, acc);
      acc.marks.push({ start, end: acc.text.length, kind: "strong" });
      return;
    }
    case "link": {
      const start = acc.text.length;
      appendNodes(node.children, acc);
      acc.links.push({ start, end: acc.text.length, href: node.url });
      return;
    }
    case "break":
      acc.text += "\n";
      return;
    case "delete":
      // Strikethrough content is still the author's content — keep the words.
      appendNodes(node.children, acc);
      return;
    case "image":
      // Standalone images become image blocks at the block layer; an inline
      // image's alt text is the best faithful representation here.
      acc.text += node.alt ?? "";
      return;
    case "html":
      // Raw inline HTML in Markdown is presentation; its text content is not
      // recoverable safely here. Skip the tag itself.
      return;
    default: {
      // Footnotes/references and other extensions: preserve any nested words.
      const maybeChildren = (node as { children?: PhrasingContent[] }).children;
      if (maybeChildren) appendNodes(maybeChildren, acc);
    }
  }
}
