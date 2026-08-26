/**
 * Deterministic, stable ID generation. IDs derive from document position and a
 * slug of nearby heading text so re-ingesting the same source yields the same
 * IDs — artwork manifests and art direction plans reference them across runs.
 */

export function slugify(text: string, maxLength = 40): string {
  const full = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let slug = full;
  if (full.length > maxLength) {
    // Cut at a word boundary, never mid-word.
    slug = full.slice(0, maxLength).replace(/-[^-]*$/, "");
  }
  slug = slug.replace(/-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}

/** Create a stable section id from its heading (or index when unheaded). */
export function sectionId(heading: string | undefined, index: number, taken: Set<string>): string {
  const base = heading ? slugify(heading) : `section-${index + 1}`;
  return dedupe(base, taken);
}

/** Create a stable block id from section id, block index and type. */
export function blockId(section: string, index: number, type: string, taken: Set<string>): string {
  return dedupe(`${section}-${type}-${index + 1}`, taken);
}

function dedupe(base: string, taken: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
