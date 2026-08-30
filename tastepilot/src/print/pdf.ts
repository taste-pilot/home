import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { settlePage } from "../browser/settle.js";
import { loadCanon } from "../canon/index.js";
import type { PrintGrammar } from "../canon/schema.js";

export interface PdfOptions {
  /** Overrides the canon's page size. */
  format?: "letter" | "a4";
  /** Output path; defaults to publication.pdf beside the input. */
  out?: string;
  /** Overrides the embedded timestamp. See deterministicTimestamp(). */
  timestamp?: Date;
}

export interface PdfResult {
  path: string;
  pageCount: number;
  warnings: string[];
}

/**
 * The renderer is byte-deterministic; Chromium is not. It stamps a wall-clock
 * CreationDate/ModDate into every PDF and names itself in /Producer, so the
 * same publication composed twice differed — and committed demo PDFs churned
 * on every build. Same input, same bytes: the timestamp is fixed and the
 * producer is named for us, not for whichever Chromium built it.
 *
 * SOURCE_DATE_EPOCH (the reproducible-builds convention, seconds since the
 * Unix epoch) wins when set, so a release can stamp a real date and stay
 * reproducible.
 */
export function deterministicTimestamp(override?: Date): Date {
  if (override) return override;
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) {
    const date = new Date(Number(epoch) * 1000);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

const DEFAULT_PRINT: PrintGrammar = {
  pageSize: "letter",
  marginsMm: { top: 20, bottom: 24, inner: 20, outer: 20 },
  showFolios: false,
  fontScale: 1,
  background: "white",
};

/** Compose the print edition of a rendered publication as a PDF. */
export async function composePdf(indexHtml: string, options: PdfOptions = {}): Promise<PdfResult> {
  const indexPath = resolve(indexHtml);
  if (!existsSync(indexPath)) {
    throw new Error(`publication not found: ${indexPath} — render it first`);
  }
  const pubDir = dirname(indexPath);
  const outPath = options.out ?? join(pubDir, "publication.pdf");
  const warnings: string[] = [];

  // The canon's print grammar travels with the publication in publication.json.
  let print = DEFAULT_PRINT;
  const pubJsonPath = join(pubDir, "publication.json");
  if (existsSync(pubJsonPath)) {
    try {
      const pubJson = JSON.parse(await readFile(pubJsonPath, "utf8")) as {
        canon?: { id?: string };
      };
      if (pubJson.canon?.id) {
        print = (await loadCanon(pubJson.canon.id)).print;
      }
    } catch {
      warnings.push("could not read canon print grammar; using defaults");
    }
  }

  const format = options.format ?? print.pageSize;
  let composed: Buffer;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(pathToFileURL(indexPath).href, { waitUntil: "networkidle" });

    // Pre-render QA: a horizontally overflowing screen layout will clip in print.
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollWidth - el.clientWidth;
    });
    if (overflow > 1) warnings.push(`screen layout overflows horizontally by ${overflow}px`);

    // Compose from a settled page: see settlePage().
    await page.emulateMedia({ media: "print" });
    await settlePage(page);

    const m = print.marginsMm;
    composed = await page.pdf({
      format: format === "a4" ? "A4" : "Letter",
      printBackground: true,
      margin: {
        top: `${m.top}mm`,
        bottom: `${m.bottom}mm`,
        left: `${m.inner}mm`,
        right: `${m.outer}mm`,
      },
      displayHeaderFooter: print.showFolios,
      headerTemplate: "<span></span>",
      footerTemplate: print.showFolios
        ? `<div style="width:100%; text-align:center; font-size:9px; font-family: Georgia, serif; color:#666;"><span class="pageNumber"></span></div>`
        : "<span></span>",
    });
  } finally {
    await browser.close();
  }

  // Automated PDF QA, on the same document we are about to normalize and write.
  if (composed.length === 0) throw new Error("PDF QA: empty file");
  const pdf = await PDFDocument.load(composed, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (pageCount === 0) throw new Error("PDF QA: zero pages");

  const timestamp = deterministicTimestamp(options.timestamp);
  pdf.setCreationDate(timestamp);
  pdf.setModificationDate(timestamp);
  pdf.setProducer("tastepilot");
  pdf.setCreator("tastepilot");

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, await pdf.save());

  return { path: outPath, pageCount, warnings };
}
