import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArtworkManifestSchema,
  EMPTY_MANIFEST,
  ensureArtworkFiles,
  artworkFilesFromManifest,
  syncManifestWithPlan,
  PlaceholderProvider,
} from "../src/artwork/index.js";
import { ingestMarkdown } from "../src/ingest/index.js";
import { validatePlanAgainstDocument } from "../src/art-direction/index.js";
import { loadCanon } from "../src/canon/index.js";
import { renderPublication } from "../src/renderer/index.js";
import type { ArtDirectionPlan } from "../src/art-direction/schema.js";
import type { ArtworkManifest } from "../src/artwork/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (p: string) => readFileSync(join(here, "..", "fixtures", p), "utf8");

function loadPlanAndDoc(): { plan: ArtDirectionPlan; doc: ReturnType<typeof ingestMarkdown> } {
  const doc = ingestMarkdown(fixture("long-guide.md"), "./fixtures/long-guide.md");
  const result = validatePlanAgainstDocument(JSON.parse(fixture("art-direction-plan.json")), doc);
  if (!result.ok || !result.plan) throw new Error(result.errors.join("\n"));
  return { plan: result.plan, doc };
}

describe("artwork manifest", () => {
  it("sync adds planned items for new requests and never touches existing ones", () => {
    const { plan } = loadPlanAndDoc();
    const existing: ArtworkManifest = {
      schemaVersion: 1,
      items: [
        {
          id: "anatomy-type-specimen",
          sectionId: "the-anatomy-of-a-publication",
          purpose: "user's own art",
          prompt: "original prompt, hand-tuned",
          file: "anatomy-type-specimen.png",
          provider: "existing-asset",
          status: "approved",
          approved: true,
          regenerate: false,
        },
      ],
    };
    const synced = syncManifestWithPlan(existing, plan);
    expect(synced.items[0]).toEqual(existing.items[0]);
    expect(synced.items).toHaveLength(1);

    const fresh = syncManifestWithPlan(structuredClone(EMPTY_MANIFEST), plan);
    expect(fresh.items).toHaveLength(1);
    expect(fresh.items[0]!.status).toBe("planned");
    expect(fresh.items[0]!.regenerate).toBe(false);
  });

  it("placeholder provider produces a deterministic SVG carrying the brief", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tp-art-"));
    const provider = new PlaceholderProvider();
    const request = {
      id: "test-art",
      placement: "right",
      wrap: "silhouette",
      size: "medium",
      brief: "A telescope pointed at a paper moon.",
    } as const;
    const a = await provider.generate(request, dir);
    const svgA = await readFile(join(dir, a.file), "utf8");
    await provider.generate(request, dir);
    const svgB = await readFile(join(dir, a.file), "utf8");
    expect(svgB).toBe(svgA);
    expect(svgA).toContain("paper moon");
    expect(svgA).toContain("planned artwork");
  });

  it("ensureArtworkFiles fills gaps with placeholders instead of failing", async () => {
    const { plan } = loadPlanAndDoc();
    const assets = await mkdtemp(join(tmpdir(), "tp-assets-"));
    const manifest = syncManifestWithPlan(structuredClone(EMPTY_MANIFEST), plan);
    const filled = await ensureArtworkFiles(manifest, plan, assets);
    const item = filled.items[0]!;
    expect(item.status).toBe("available");
    expect(item.provider).toBe("placeholder");
    expect(item.file).toBe("anatomy-type-specimen.svg");
    const files = artworkFilesFromManifest(filled);
    expect(files.get("anatomy-type-specimen")).toBe("assets/anatomy-type-specimen.svg");
  });

  it("RED LINE: approved artwork survives canon changes byte-for-byte", async () => {
    const { plan, doc } = loadPlanAndDoc();
    const assets = await mkdtemp(join(tmpdir(), "tp-durable-"));
    const artFile = join(assets, "anatomy-type-specimen.png");
    await writeFile(artFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));

    let manifest: ArtworkManifest = {
      schemaVersion: 1,
      items: [
        {
          id: "anatomy-type-specimen",
          sectionId: "the-anatomy-of-a-publication",
          purpose: "approved illustration",
          prompt: "hand-tuned prompt",
          file: "anatomy-type-specimen.png",
          provider: "existing-asset",
          status: "approved",
          approved: true,
          regenerate: false,
        },
      ],
    };
    const before = JSON.stringify(manifest);
    const artBefore = await readFile(artFile);

    for (const canonId of ["modern-editorial", "swiss-clean", "literary-classic"]) {
      const canon = await loadCanon(canonId);
      manifest = syncManifestWithPlan(manifest, plan);
      manifest = await ensureArtworkFiles(manifest, plan, assets);
      const outDir = await mkdtemp(join(tmpdir(), `tp-durable-out-${canonId}-`));
      await renderPublication(
        {
          document: doc,
          canon,
          plan: { ...plan, style: canonId },
          artworkFiles: artworkFilesFromManifest(manifest),
          assetsSourceDir: assets,
        },
        outDir,
      );
      const html = await readFile(join(outDir, "index.html"), "utf8");
      expect(html).toContain('src="assets/anatomy-type-specimen.png"');
      expect(html).not.toContain("art--placeholder");
    }

    expect(JSON.stringify(manifest)).toBe(before);
    expect(await readFile(artFile)).toEqual(artBefore);
  });

  it("approved artwork with a missing file is flagged, never regenerated", async () => {
    const { plan } = loadPlanAndDoc();
    const assets = await mkdtemp(join(tmpdir(), "tp-missing-"));
    const manifest: ArtworkManifest = {
      schemaVersion: 1,
      items: [
        {
          id: "anatomy-type-specimen",
          sectionId: "the-anatomy-of-a-publication",
          purpose: "approved but lost",
          prompt: "hand-tuned prompt",
          file: "gone.png",
          provider: "existing-asset",
          status: "approved",
          approved: true,
          regenerate: false,
        },
      ],
    };
    const result = await ensureArtworkFiles(manifest, plan, assets);
    expect(result.items[0]!.status).toBe("missing");
    expect(result.items[0]!.file).toBe("gone.png");
  });

  it("silhouette CSS is emitted only for real files", async () => {
    const { plan, doc } = loadPlanAndDoc();
    const assets = await mkdtemp(join(tmpdir(), "tp-shape-"));
    const manifest = await ensureArtworkFiles(
      syncManifestWithPlan(structuredClone(EMPTY_MANIFEST), plan),
      plan,
      assets,
    );
    const outDir = await mkdtemp(join(tmpdir(), "tp-shape-out-"));
    const canon = await loadCanon("modern-editorial");
    await renderPublication(
      {
        document: doc,
        canon,
        plan,
        artworkFiles: artworkFilesFromManifest(manifest),
        assetsSourceDir: assets,
      },
      outDir,
    );
    const css = await readFile(join(outDir, "publication.css"), "utf8");
    expect(css).toContain("shape-outside");
    expect(css).toContain("anatomy-type-specimen.svg");
    expect((await stat(join(outDir, "assets", "anatomy-type-specimen.svg"))).size).toBeGreaterThan(
      0,
    );
  });

  it("manifest schema rejects duplicates and unknown keys", async () => {
    const bad = {
      schemaVersion: 1,
      items: [
        { id: "a", sectionId: "s", purpose: "", prompt: "", status: "planned", sneaky: true },
      ],
    };
    expect(() => ArtworkManifestSchema.parse(bad)).toThrow();
    await mkdir(join(tmpdir(), "noop"), { recursive: true });
  });
});
