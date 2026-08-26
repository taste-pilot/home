import { chromium } from "playwright";
import * as cheerio from "cheerio";
import type { SemanticDocument } from "../semantic/schema.js";
import { ingestHtml } from "./html.js";
import { extractBrandDna, type BrandDna } from "./brand-dna.js";

/**
 * Public webpage → Semantic Document + Brand DNA.
 *
 * TastePilot never attempts to circumvent paywalls, authentication, or access
 * restrictions — it loads the page exactly as an anonymous visitor sees it.
 */

/** Likely non-content clutter, removed before semantic extraction (spec §9). */
const CLUTTER_SELECTORS = [
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[class*="newsletter"]',
  '[class*="subscribe"]',
  '[class*="signup"]',
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[class*="advert"]',
  '[class*="sponsor"]',
  '[id^="ad-"]',
  '[class^="ad-"]',
  ".ad",
  ".ads",
  '[class*="social-share"]',
  '[class*="share-"]',
  '[class*="sharing"]',
  '[class*="related"]',
  '[class*="recommend"]',
  '[class*="trending"]',
  '[class*="promo"]',
  '[class*="sticky"]',
  '[class*="banner"]',
  '[class*="app-install"]',
  '[class*="smartbanner"]',
  '[class*="chat"]',
  '[class*="intercom"]',
  '[class*="paywall-prompt"]',
];

export interface UrlIngestResult {
  document: SemanticDocument;
  brandDna: BrandDna;
}

export interface UrlIngestOptions {
  /** Max milliseconds to wait for the page to settle. */
  timeoutMs?: number;
}

export async function ingestUrl(
  url: string,
  options: UrlIngestOptions = {},
): Promise<UrlIngestResult> {
  const timeout = options.timeoutMs ?? 30_000;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await page.waitForLoadState("networkidle", { timeout }).catch(() => {
      // Never fail ingestion because analytics beacons keep a socket open.
    });

    // Progressively scroll so lazy-loaded article assets appear.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let i = 0; i < 20; i++) {
        const before = window.scrollY;
        window.scrollBy(0, step);
        await new Promise((r) => setTimeout(r, 120));
        if (window.scrollY === before) break;
      }
      window.scrollTo(0, 0);
    });

    const brandDna = await extractBrandDna(page, url);
    const rendered = await page.content();

    const $ = cheerio.load(rendered);
    for (const selector of CLUTTER_SELECTORS) {
      try {
        $(selector).remove();
      } catch {
        // An unsupported selector must never break extraction.
      }
    }
    const cleaned = $.html();

    const document = ingestHtml(cleaned, url);
    return {
      document: {
        ...document,
        source: { ...document.source, type: "url", location: url, sourceUrl: url },
      },
      brandDna,
    };
  } finally {
    await browser.close();
  }
}
