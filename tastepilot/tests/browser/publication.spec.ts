import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { ingestMarkdown } from "../../src/ingest/index.js";
import { loadCanon } from "../../src/canon/index.js";
import { validatePlanAgainstDocument } from "../../src/art-direction/index.js";
import { renderPublication } from "../../src/renderer/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const CANONS = ["modern-editorial", "literary-classic", "swiss-clean"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 800 },
  { name: "mobile", width: 390, height: 800 },
];

const pubDirs = new Map<string, string>();

test.beforeAll(async () => {
  const source = await readFile(join(here, "..", "..", "fixtures", "long-guide.md"), "utf8");
  const planRaw = JSON.parse(
    await readFile(join(here, "..", "..", "fixtures", "art-direction-plan.json"), "utf8"),
  );
  const doc = ingestMarkdown(source, "./fixtures/long-guide.md");
  const result = validatePlanAgainstDocument(planRaw, doc);
  if (!result.ok || !result.plan) throw new Error(result.errors.join("\n"));
  // 1×1 transparent PNG standing in for the fixture's content image.
  const stubPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  for (const id of CANONS) {
    const dir = await mkdtemp(join(tmpdir(), `tp-pw-${id}-`));
    const canon = await loadCanon(id);
    await renderPublication({ document: doc, canon, plan: { ...result.plan, style: id } }, dir);
    await writeFile(join(dir, "assets", "composing-stick.png"), stubPng);
    pubDirs.set(id, dir);
  }
});

for (const canonId of CANONS) {
  for (const vp of VIEWPORTS) {
    test(`${canonId} @ ${vp.name}: no horizontal overflow, readable column`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(pathToFileURL(join(pubDirs.get(canonId)!, "index.html")).href);
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement!;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(1);

      // The reading column is intentionally constrained (canon measure); the
      // check guards against float-squeezed or collapsed text, not editorial
      // narrowness.
      const bodyWidth = await page.evaluate(() => {
        const p = document.querySelector(".pub-body p");
        return p ? p.getBoundingClientRect().width : 0;
      });
      const floor = vp.width < 900 ? vp.width * 0.75 : 380;
      expect(bodyWidth, "body column too narrow").toBeGreaterThan(floor);
    });
  }
}

test("theme control: explicit choice applies and persists across reload", async ({ page }) => {
  const url = pathToFileURL(join(pubDirs.get("modern-editorial")!, "index.html")).href;
  await page.goto(url);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkBg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor,
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(darkBg);
  await page.getByRole("button", { name: "Auto" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
});

test("paired palettes: dark is a design, not an inversion", async ({ page }) => {
  const url = pathToFileURL(join(pubDirs.get("modern-editorial")!, "index.html")).href;
  await page.goto(url);
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole("button", { name: "Dark" }).click();
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
  // The dark paper is a warm tone (#171412), not inverted light paper.
  expect(dark).toBe("rgb(23, 20, 18)");
});

test("reduced motion: everything visible, no reveal classes applied", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const url = pathToFileURL(join(pubDirs.get("modern-editorial")!, "index.html")).href;
  await page.goto(url);
  const hiddenCount = await page.evaluate(
    () => document.querySelectorAll(".motion-hidden").length,
  );
  expect(hiddenCount).toBe(0);
  const opacity = await page.evaluate(() => {
    const el = document.querySelector(".pull-quote");
    return el ? getComputedStyle(el).opacity : "1";
  });
  expect(opacity).toBe("1");
});

test("motion reveals appear on scroll without touching body paragraphs", async ({ page }) => {
  const url = pathToFileURL(join(pubDirs.get("modern-editorial")!, "index.html")).href;
  await page.goto(url);
  const paragraphHidden = await page.evaluate(() => {
    const p = document.querySelector(".pub-body > .section > p");
    return p ? p.classList.contains("motion-hidden") : false;
  });
  expect(paragraphHidden, "body text must stay stable").toBe(false);
  await page.mouse.wheel(0, 20000);
  await page.waitForTimeout(900);
  const stillHidden = await page.evaluate(
    () => document.querySelectorAll(".motion-hidden").length,
  );
  expect(stillHidden).toBe(0);
});

test("no broken images and JS-free reading works", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(pathToFileURL(join(pubDirs.get("literary-classic")!, "index.html")).href);
  await expect(page.locator(".pub-title")).toBeVisible();
  const controlVisible = await page.locator(".theme-control").isVisible();
  expect(controlVisible, "theme control stays hidden without JS").toBe(false);
  const brokenImages = await page.evaluate(() =>
    Array.from(document.images).filter(
      (img) => img.src && !img.src.startsWith("data:") && img.naturalWidth === 0 && img.complete,
    ).length,
  );
  expect(brokenImages).toBe(0);
  await context.close();
});
