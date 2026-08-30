import type { Page } from "playwright";

/**
 * Wait until the page is ready to paint, not merely finished fetching.
 *
 * `waitUntil: "networkidle"` returns once the network is quiet, which is
 * earlier than fonts being ready and images being decoded. Capturing then is a
 * race: the same publication composed twice produced different PDF bytes —
 * visually identical, but Skia emitted an unsettled first page — and committed
 * demo output churned on rebuild.
 */
export async function settlePage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => undefined)),
    );
  });
}
