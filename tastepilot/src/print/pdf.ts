import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { loadCanon } from "../canon/index.js";
import type { PrintGrammar } from "../canon/schema.js";

export interface PdfOptions {
  /** Overrides the canon's page size. */
  format?: "letter" | "a4";
  /** Output path; defaults to publication.pdf beside the input. */
  out?: string;
}

export interface PdfResult {
  path: string;
  pageCount: number;
  warnings: string[];
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

    const m = print.marginsMm;
    await page.pdf({
      path: outPath,
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

  // Automated PDF QA.
  const bytes = await readFile(outPath);
  if (bytes.length === 0) throw new Error("PDF QA: empty file");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (pageCount === 0) throw new Error("PDF QA: zero pages");

  return { path: outPath, pageCount, warnings };
}
