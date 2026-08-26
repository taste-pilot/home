import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { ingestUrl } from "../../src/ingest/url.js";
import { serializeDocument } from "../../src/semantic/serialize.js";
import { applyBrandDna, loadCanon } from "../../src/canon/index.js";

const here = dirname(fileURLToPath(import.meta.url));

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  const html = await readFile(
    join(here, "..", "..", "fixtures", "cluttered-page", "index.html"),
    "utf8",
  );
  server = createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("url ingestion extracts the article and removes clutter", async () => {
  const { document } = await ingestUrl(baseUrl);
  expect(document.metadata.title).toBe("The Unhurried Web");
  expect(document.metadata.author).toBe("R. Tempo");
  expect(document.source.type).toBe("url");
  expect(document.source.sourceUrl).toBe(baseUrl);

  const serialized = serializeDocument(document);
  expect(serialized).toContain("does not blink, autoplay");
  expect(serialized).toContain("Speed is a business model.");
  expect(serialized).not.toContain("cookies");
  expect(serialized).not.toContain("BUY PIXELS");
  expect(serialized).not.toContain("Subscribe for more slowness");
  expect(serialized).not.toContain("You might also like");
  expect(serialized).not.toContain("DOWNLOAD OUR APP");
  expect(serialized).not.toContain("Share on everything");
  expect(serialized).not.toContain("Need help?");
  expect(serialized).not.toContain("tracking!");

  const link = document.sections
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.type === "paragraph" ? b.content.links : []));
  expect(link.some((l) => l.href === "https://example.com/patient")).toBe(true);
});

test("brand DNA captures the site's visual identity", async () => {
  const { brandDna } = await ingestUrl(baseUrl);
  expect(brandDna.backgroundColors).toContain("#fdfcf8");
  expect(brandDna.textColors).toContain("#22211e");
  expect(brandDna.primaryColors).toContain("#b4552d");
  expect(brandDna.bodyFontHints[0]).toBe("Georgia");
  expect(brandDna.headlineFontHints[0]).toBe("Helvetica");
  expect(brandDna.buttonTreatment?.background).toBe("#b4552d");
  expect(brandDna.logoCandidate).toContain("logo.svg");
});

test("preserve/evolve/reinvent blend brand DNA into the canon correctly", async () => {
  const { brandDna } = await ingestUrl(baseUrl);
  const canon = await loadCanon("modern-editorial");

  const reinvented = applyBrandDna(canon, brandDna, "reinvent");
  expect(reinvented).toEqual(canon);

  const evolved = applyBrandDna(canon, brandDna, "evolve");
  expect(evolved.palette.light.accent).toBe("#b4552d");
  expect(evolved.typography.body.family).toBe(canon.typography.body.family);
  expect(evolved.palette.dark).toEqual(canon.palette.dark);

  const preserved = applyBrandDna(canon, brandDna, "preserve");
  expect(preserved.palette.light.paper).toBe("#fdfcf8");
  expect(preserved.typography.heading.family).toBe("Helvetica");
  expect(preserved.typography.body.family).toBe("Georgia");
  expect(preserved.typography.body.fallbacks[0]).toBe(canon.typography.body.family);
});
