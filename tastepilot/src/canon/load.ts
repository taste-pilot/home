import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  CanonManifestSchema,
  CanonStyleSchema,
  LayoutGrammarSchema,
  MotionGrammarSchema,
  PaletteSystemSchema,
  PrintGrammarSchema,
  TypographySystemSchema,
  type CanonStyle,
} from "./schema.js";

/**
 * Canon loading is built on interchangeable SOURCES:
 * bundled starter styles, user-installed/custom-local styles, and future
 * remote sources (Community Canon, TastePilot Library via the registry API —
 * never direct repository access).
 *
 * ID lookup falls through sources in order. Listing aggregates across ALL
 * sources with the source recorded as metadata, never priority: canon
 * recommendation is source-neutral.
 */

export type CanonSourceKind = "bundled" | "local" | "community" | "library";

export interface CanonSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly source: CanonSourceKind;
  readonly description: string;
  readonly tags: ReadonlyArray<string>;
}

export interface CanonSource {
  readonly kind: CanonSourceKind;
  list(): Promise<CanonSummary[]>;
  /** Returns undefined when this source does not have the canon. */
  load(id: string): Promise<CanonStyle | undefined>;
}

const PART_FILES = {
  typography: TypographySystemSchema,
  palette: PaletteSystemSchema,
  layout: LayoutGrammarSchema,
  motion: MotionGrammarSchema,
  print: PrintGrammarSchema,
} as const;

/**
 * The complete file list of a canon. These are the only files loaded, the only
 * files the security scan sees, and — so the two can never diverge — the only
 * files `canon install` copies. Anything else in a canon folder is ignored.
 */
export const CANON_FILES = [
  "manifest.json",
  ...Object.keys(PART_FILES).map((part) => `${part}.json`),
] as const;

/** Load and validate one canon folder. Throws with actionable messages. */
export async function loadCanonDir(dir: string): Promise<CanonStyle> {
  const readPart = async (file: string): Promise<unknown> => {
    const path = join(dir, file);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      throw new Error(`canon at ${dir} is missing required file ${file}`);
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`${path} is not valid JSON: ${(err as Error).message}`);
    }
  };

  const parsePart = <T>(schema: z.ZodType<T>, value: unknown, file: string): T => {
    const result = schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(`${join(dir, file)} failed validation:\n${issues}`);
    }
    return result.data;
  };

  const manifest = parsePart(CanonManifestSchema, await readPart("manifest.json"), "manifest.json");
  const style = {
    manifest,
    typography: parsePart(
      PART_FILES.typography,
      await readPart("typography.json"),
      "typography.json",
    ),
    palette: parsePart(PART_FILES.palette, await readPart("palette.json"), "palette.json"),
    layout: parsePart(PART_FILES.layout, await readPart("layout.json"), "layout.json"),
    motion: parsePart(PART_FILES.motion, await readPart("motion.json"), "motion.json"),
    print: parsePart(PART_FILES.print, await readPart("print.json"), "print.json"),
  };
  return CanonStyleSchema.parse(style);
}

/** A canon source backed by a directory of canon folders. */
class DirectoryCanonSource implements CanonSource {
  constructor(
    readonly kind: CanonSourceKind,
    private readonly root: string,
  ) {}

  async list(): Promise<CanonSummary[]> {
    if (!existsSync(this.root)) return [];
    const entries = await readdir(this.root, { withFileTypes: true });
    const summaries: CanonSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const style = await loadCanonDir(join(this.root, entry.name));
        summaries.push({
          id: style.manifest.id,
          name: style.manifest.name,
          version: style.manifest.version,
          source: this.kind,
          description: style.manifest.description,
          tags: style.manifest.tags,
        });
      } catch {
        // An invalid canon folder must not break listing of the valid ones.
      }
    }
    return summaries.sort((a, b) => a.id.localeCompare(b.id));
  }

  async load(id: string): Promise<CanonStyle | undefined> {
    const dir = join(this.root, id);
    if (!existsSync(join(dir, "manifest.json"))) return undefined;
    const style = await loadCanonDir(dir);
    if (style.manifest.id !== id) {
      throw new Error(
        `canon folder "${id}" declares mismatched id "${style.manifest.id}" in its manifest`,
      );
    }
    return style;
  }
}

/** Package root (the copied tastepilot/ folder), from src/ or dist/. */
function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function bundledCanonSource(): CanonSource {
  return new DirectoryCanonSource("bundled", join(packageRoot(), "canon", "starter"));
}

/** Where `canon install` writes, and where the "local" source reads. */
export function installedCanonRoot(): string {
  return join(packageRoot(), "canon", "installed");
}

export function localCanonSource(root?: string): CanonSource {
  return new DirectoryCanonSource("local", root ?? installedCanonRoot());
}

export class CanonResolver {
  constructor(private readonly sources: ReadonlyArray<CanonSource>) {}

  /** Aggregate across ALL sources; source is metadata, never priority. */
  async listCanons(): Promise<CanonSummary[]> {
    const all = await Promise.all(this.sources.map((s) => s.list()));
    return all.flat();
  }

  /** ID lookup falls through sources in order (first match wins). */
  async loadCanon(id: string): Promise<CanonStyle> {
    for (const source of this.sources) {
      const style = await source.load(id);
      if (style) return style;
    }
    const available = (await this.listCanons()).map((c) => `${c.id} (${c.source})`);
    throw new Error(
      `unknown canon "${id}". Available: ${available.length ? available.join(", ") : "none"}`,
    );
  }
}

/**
 * The offline core: bundled starters + user-installed local canons, and
 * nothing that touches a network. `configuredResolver()` in ./index.ts is what
 * callers want — it is this chain plus a remote registry when one is set.
 */
export function defaultResolver(): CanonResolver {
  return new CanonResolver([bundledCanonSource(), localCanonSource()]);
}
