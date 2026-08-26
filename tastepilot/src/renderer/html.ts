import type { InlineText } from "../semantic/schema.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(text: string): string {
  return escapeHtml(text);
}

/**
 * Render InlineText to HTML by splitting the text at every annotation
 * boundary and nesting tags deterministically (a > strong > em > code).
 * The author's words are escaped, never altered.
 */
export function renderInline(inline: InlineText): string {
  const { text, links, marks } = inline;
  if (text.length === 0) return "";

  const boundaries = new Set<number>([0, text.length]);
  for (const l of links) {
    boundaries.add(Math.min(l.start, text.length));
    boundaries.add(Math.min(l.end, text.length));
  }
  for (const m of marks) {
    boundaries.add(Math.min(m.start, text.length));
    boundaries.add(Math.min(m.end, text.length));
  }
  const points = [...boundaries].sort((a, b) => a - b);

  // Render segment-by-segment, but keep the link element (the outermost
  // wrapper) open across consecutive segments belonging to the same link.
  let html = "";
  let openLink: (typeof links)[number] | undefined;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start) continue;
    const segment = escapeHtml(text.slice(start, end));
    const link = links.find((l) => l.start <= start && l.end >= end);
    const kinds = new Set(
      marks.filter((m) => m.start <= start && m.end >= end).map((m) => m.kind),
    );
    let wrapped = segment;
    if (kinds.has("code")) wrapped = `<code>${wrapped}</code>`;
    if (kinds.has("em")) wrapped = `<em>${wrapped}</em>`;
    if (kinds.has("strong")) wrapped = `<strong>${wrapped}</strong>`;
    if (link !== openLink) {
      if (openLink) html += "</a>";
      if (link) html += `<a href="${escapeAttr(link.href)}">`;
      openLink = link;
    }
    html += wrapped;
  }
  if (openLink) html += "</a>";
  return html;
}
