import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { settlePage } from "../browser/settle.js";

/**
 * Automated visual QA for a rendered publication. Screenshots at three
 * viewports plus mechanical checks; a machine-readable report the agent uses
 * to fix-and-rerender before declaring completion.
 */

export interface QaIssue {
  check: string;
  viewport: string;
  detail: string;
}

export interface QaReport {
  pass: boolean;
  failures: QaIssue[];
  warnings: QaIssue[];
  screenshots: string[];
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 800 },
  { name: "mobile", width: 390, height: 800 },
] as const;

export async function runQa(publicationDir: string, qaDir?: string): Promise<QaReport> {
  const indexPath = resolve(publicationDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`no publication at ${publicationDir} — render first`);
  }
  const outDir = qaDir ?? join(resolve(publicationDir), "qa");
  await mkdir(outDir, { recursive: true });

  const failures: QaIssue[] = [];
  const warnings: QaIssue[] = [];
  const screenshots: string[] = [];
  const url = pathToFileURL(indexPath).href;

  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(url, { waitUntil: "networkidle" });
      await settlePage(page);
      await collectChecks(page, vp.name, failures, warnings);
      const shot = join(outDir, `${vp.name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      screenshots.push(shot);
      await page.close();
    }

    // Theme control behavior (desktop only).
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle" });
    await settlePage(page);
    const themeWorks = await page.evaluate(() => {
      const dark = document.querySelector<HTMLButtonElement>('[data-theme-choice="dark"]');
      if (!dark) return false;
      dark.click();
      return document.documentElement.getAttribute("data-theme") === "dark";
    });
    if (!themeWorks) {
      failures.push({
        check: "theme-control",
        viewport: "desktop",
        detail: "Light/Dark/Auto control missing or non-functional",
      });
    }
    await page.close();

    // Reduced motion: nothing may stay hidden.
    const rmPage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    await rmPage.goto(url, { waitUntil: "networkidle" });
    await settlePage(rmPage);
    const hidden = await rmPage.evaluate(() => document.querySelectorAll(".motion-hidden").length);
    if (hidden > 0) {
      failures.push({
        check: "reduced-motion",
        viewport: "desktop",
        detail: `${hidden} element(s) hidden under prefers-reduced-motion`,
      });
    }
    await rmPage.close();
  } finally {
    await browser.close();
  }

  const report: QaReport = { pass: failures.length === 0, failures, warnings, screenshots };
  await writeFile(join(outDir, "qa-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  return report;
}

async function collectChecks(
  page: Page,
  viewport: string,
  failures: QaIssue[],
  warnings: QaIssue[],
): Promise<void> {
  const results = await page.evaluate(() => {
    const out: Array<{ check: string; detail: string; severity: "failure" | "warning" }> = [];

    const scroller = document.scrollingElement!;
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    if (overflow > 1) {
      out.push({
        check: "horizontal-overflow",
        detail: `page overflows horizontally by ${overflow}px`,
        severity: "failure",
      });
    }

    for (const img of Array.from(document.images)) {
      if (!img.src || img.src.startsWith("data:")) continue;
      if (img.complete && img.naturalWidth === 0) {
        out.push({
          check: "broken-image",
          detail: `broken image asset: ${img.getAttribute("src")}`,
          severity: "failure",
        });
      } else {
        const rect = img.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          out.push({
            check: "zero-size-image",
            detail: `zero-size image: ${img.getAttribute("src")}`,
            severity: "warning",
          });
        }
      }
    }

    for (const p of Array.from(document.querySelectorAll(".pub-body p"))) {
      const rect = p.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 180 && (p.textContent ?? "").length > 80) {
        out.push({
          check: "narrow-text",
          detail: `body text squeezed to ${Math.round(rect.width)}px (likely a float)`,
          severity: "failure",
        });
        break;
      }
    }

    const docWidth = scroller.clientWidth;
    for (const el of Array.from(document.querySelectorAll(".pub-body > .section > *"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.right < -1 || rect.left > docWidth + 1)) {
        out.push({
          check: "offscreen-element",
          detail: `element entirely outside the viewport: ${el.tagName.toLowerCase()}#${el.id || "?"}`,
          severity: "failure",
        });
      }
    }

    return out;
  });

  for (const r of results) {
    const issue = { check: r.check, viewport, detail: r.detail };
    if (r.severity === "failure") failures.push(issue);
    else warnings.push(issue);
  }
}
