import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ArtDirectionPlan } from "../art-direction/schema.js";
import { ArtworkManifestSchema, type ArtworkManifest, type ArtworkItem } from "./schema.js";
import { ExistingAssetProvider, PlaceholderProvider, type ArtworkProvider } from "./providers.js";

export const EMPTY_MANIFEST: ArtworkManifest = { schemaVersion: 1, items: [] };

export async function loadManifest(path: string): Promise<ArtworkManifest> {
  if (!existsSync(path)) return structuredClone(EMPTY_MANIFEST);
  return ArtworkManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function saveManifest(path: string, manifest: ArtworkManifest): Promise<void> {
  await writeFile(
    path,
    JSON.stringify(ArtworkManifestSchema.parse(manifest), null, 2) + "\n",
    "utf8",
  );
}

/**
 * Bring the manifest in line with an Art Direction Plan: new artwork requests
 * become "planned" items. EXISTING ITEMS ARE NEVER MODIFIED OR REMOVED here —
 * a redesign (new canon, new plan) reuses durable artwork by id.
 */
export function syncManifestWithPlan(
  manifest: ArtworkManifest,
  plan: ArtDirectionPlan,
  createdAt?: string,
): ArtworkManifest {
  const known = new Set(manifest.items.map((i) => i.id));
  const additions: ArtworkItem[] = [];
  for (const section of plan.sections) {
    for (const request of section.artwork) {
      if (known.has(request.id)) continue;
      known.add(request.id);
      additions.push({
        id: request.id,
        sectionId: section.sectionId,
        purpose: `${request.placement} artwork for section "${section.sectionId}"`,
        prompt: request.brief,
        status: "planned",
        approved: false,
        regenerate: false,
        ...(createdAt ? { createdAt } : {}),
      });
    }
  }
  if (additions.length === 0) return manifest;
  return { schemaVersion: 1, items: [...manifest.items, ...additions] };
}

/**
 * Make sure every planned/missing item has a file, without ever touching
 * approved artwork or items whose file already exists (unless the user set
 * regenerate: true on an item — the only path to regeneration).
 */
export async function ensureArtworkFiles(
  manifest: ArtworkManifest,
  plan: ArtDirectionPlan,
  assetsDir: string,
  providers: ReadonlyArray<ArtworkProvider> = [
    new ExistingAssetProvider(),
    new PlaceholderProvider(),
  ],
): Promise<ArtworkManifest> {
  await mkdir(assetsDir, { recursive: true });
  const requests = new Map(
    plan.sections.flatMap((s) => s.artwork.map((a) => [a.id, a] as const)),
  );

  const items = await Promise.all(
    manifest.items.map(async (item): Promise<ArtworkItem> => {
      const fileExists = item.file !== undefined && existsSync(join(assetsDir, item.file));
      const needsFile = item.regenerate || !fileExists;
      if (!needsFile) return item;
      if (item.approved && !item.regenerate) {
        // Approved artwork with a missing file is flagged, never regenerated.
        return fileExists ? item : { ...item, status: "missing" };
      }
      const request = requests.get(item.id);
      if (!request) return fileExists ? item : { ...item, status: "missing" };
      for (const provider of providers) {
        const generated = await provider.generate(request, assetsDir);
        if (generated) {
          return {
            ...item,
            file: generated.file,
            provider: generated.provider,
            status: "available",
            regenerate: false,
          };
        }
      }
      return { ...item, status: "failed" };
    }),
  );
  return { schemaVersion: 1, items };
}

/** Map artwork id → assets-relative path for every renderable item. */
export function artworkFilesFromManifest(manifest: ArtworkManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of manifest.items) {
    if (item.file && (item.status === "available" || item.status === "approved")) {
      map.set(item.id, `assets/${item.file}`);
    }
  }
  return map;
}
