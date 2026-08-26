import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ArtworkRequest } from "../art-direction/schema.js";

/**
 * Providers are interchangeable and vendor-neutral: the renderer must never
 * depend on one image model. MVP ships exactly two — reuse what exists, and
 * generate an attractive placeholder so the whole pipeline runs without any
 * paid generation.
 */
export interface GeneratedArtwork {
  readonly id: string;
  /** Path relative to the assets directory. */
  readonly file: string;
  readonly provider: string;
}

export interface ArtworkProvider {
  readonly name: string;
  /** Returns undefined when this provider cannot supply the artwork. */
  generate(request: ArtworkRequest, assetsDir: string): Promise<GeneratedArtwork | undefined>;
}

const IMAGE_EXTENSIONS = [".png", ".webp", ".svg", ".jpg", ".jpeg"];

/** Reuses an asset the user already has: assets/<id>.<ext>. */
export class ExistingAssetProvider implements ArtworkProvider {
  readonly name = "existing-asset";

  async generate(
    request: ArtworkRequest,
    assetsDir: string,
  ): Promise<GeneratedArtwork | undefined> {
    for (const ext of IMAGE_EXTENSIONS) {
      const candidate = `${request.id}${ext}`;
      if (existsSync(join(assetsDir, candidate))) {
        return { id: request.id, file: candidate, provider: this.name };
      }
    }
    return undefined;
  }
}

const SIZE_BOX = {
  small: { w: 480, h: 360 },
  medium: { w: 720, h: 540 },
  large: { w: 960, h: 640 },
} as const;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > maxChars && line !== "") {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines.slice(0, 8);
}

/**
 * Produces a deterministic SVG placeholder that carries the artwork brief, so
 * publications are fully testable before any real artwork exists.
 */
export class PlaceholderProvider implements ArtworkProvider {
  readonly name = "placeholder";

  async generate(request: ArtworkRequest, assetsDir: string): Promise<GeneratedArtwork> {
    const box = SIZE_BOX[request.size];
    const lines = wrapText(request.brief, 44);
    const textY = box.h / 2 - ((lines.length - 1) * 22) / 2;
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${box.w / 2}" y="${textY + i * 22}">${escapeXml(line)}</tspan>`,
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.w} ${box.h}" role="img" aria-label="Planned artwork">
  <rect x="6" y="6" width="${box.w - 12}" height="${box.h - 12}" rx="14" fill="#f2ede4" stroke="#c9beac" stroke-width="2" stroke-dasharray="8 7"/>
  <text x="${box.w / 2}" y="${textY - 34}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="17" fill="#9a8b72">planned artwork</text>
  <text text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#6d6152">${tspans}</text>
</svg>
`;
    const file = `${request.id}.svg`;
    await writeFile(join(assetsDir, file), svg, "utf8");
    return { id: request.id, file, provider: this.name };
  }
}
