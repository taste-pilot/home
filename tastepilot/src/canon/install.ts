import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CANON_FILES, installedCanonRoot } from "./load.js";
import { validateCanon } from "./validate.js";
import type { CanonStyle } from "./schema.js";

export interface CanonInstallResult {
  ok: boolean;
  style?: CanonStyle;
  dir?: string;
  errors: string[];
}

/** OS cruft that is never a payload and never copied — not worth refusing over. */
const IGNORED_ENTRIES = new Set([".DS_Store", "Thumbs.db"]);

/**
 * Entries in a canon folder that are not one of the CANON_FILES.
 *
 * A canon is data, not a payload. Anything else in the folder is unvalidated
 * and unscanned — a stray AGENTS.md or hook.js would otherwise land inside the
 * folder the coding agent works in — so we refuse loudly rather than copy it,
 * and refuse rather than silently drop it: an author who put a file there
 * meant something by it and deserves to be told.
 */
export async function unexpectedCanonEntries(dir: string): Promise<string[]> {
  const known = new Set<string>(CANON_FILES);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => !known.has(e.name) && !IGNORED_ENTRIES.has(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort();
}

/**
 * Install a validated canon into the local source.
 *
 * Only the six CANON_FILES are ever copied, and a folder carrying anything
 * else is refused outright.
 */
export async function installCanon(target: string, root?: string): Promise<CanonInstallResult> {
  const result = await validateCanon(target);
  if (!result.ok) return { ok: false, errors: result.errors };

  const extra = await unexpectedCanonEntries(target);
  if (extra.length > 0) {
    return {
      ok: false,
      errors: [
        `${target} contains ${extra.length} file(s) that are not part of a canon: ${extra.join(", ")}`,
        `a canon is exactly ${CANON_FILES.join(", ")} — remove anything else and install again`,
      ],
    };
  }

  const style = result.style!;
  const dir = join(root ?? installedCanonRoot(), style.manifest.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const file of CANON_FILES) {
    await copyFile(join(target, file), join(dir, file));
  }
  return { ok: true, style, dir, errors: [] };
}

/**
 * Install a canon that arrived as data rather than as a folder — from the
 * registry. The same six files land on disk, written from the validated
 * object, so a remote install and a local one are indistinguishable
 * afterwards.
 */
export async function installCanonStyle(style: CanonStyle, root?: string): Promise<string> {
  const dir = join(root ?? installedCanonRoot(), style.manifest.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const parts: Record<string, unknown> = {
    "manifest.json": style.manifest,
    "typography.json": style.typography,
    "palette.json": style.palette,
    "layout.json": style.layout,
    "motion.json": style.motion,
    "print.json": style.print,
  };
  for (const file of CANON_FILES) {
    await writeFile(join(dir, file), JSON.stringify(parts[file], null, 2) + "\n", "utf8");
  }
  return dir;
}
