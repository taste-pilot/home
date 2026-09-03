/**
 * A tiny Canon registry, for development and tests.
 *
 * It serves the bundled starters over the shape a real registry publishes:
 * `/canons.json` for the listing, `/canons/<id>.json` and
 * `/canons/<id>/<version>.json` for one canon — paths a static file tree can
 * serve as-is. Enough to exercise the client's validation, caching,
 * versioning and offline fallback without inventing a service.
 */
import { createServer, type Server } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { loadCanonDir } from "../src/canon/load.js";
import type { CanonStyle } from "../src/canon/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const STARTER_DIR = join(here, "..", "canon", "starter");

export interface MockRegistry {
  url: string;
  /** Serve this canon instead of the bundled one — for testing bad payloads. */
  put(id: string, body: unknown): void;
  close(): Promise<void>;
}

export async function startMockRegistry(
  ids: string[] = ["modern-editorial", "swiss-clean"],
  port = 0,
): Promise<MockRegistry> {
  const canons = new Map<string, unknown>();
  for (const id of ids) {
    canons.set(id, (await loadCanonDir(join(STARTER_DIR, id))) as CanonStyle);
  }

  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      const text = JSON.stringify(body);
      res.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(text),
      });
      res.end(text);
    };
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (path === "/canons.json") {
      return send(200, {
        canons: [...canons.values()].map((c) => {
          const style = c as CanonStyle;
          return {
            id: style.manifest.id,
            name: style.manifest.name,
            version: style.manifest.version,
            description: style.manifest.description,
            tags: style.manifest.tags,
          };
        }),
      });
    }
    const match = /^\/canons\/([^/]+?)(?:\/([^/]+?))?\.json$/.exec(path);
    if (match) {
      const style = canons.get(decodeURIComponent(match[1]!));
      if (!style) return send(404, { error: "unknown canon" });
      const version = match[2] ? decodeURIComponent(match[2]) : undefined;
      const declared = (style as CanonStyle).manifest?.version;
      if (version && declared && version !== declared) {
        return send(404, { error: `no version ${version}` });
      }
      return send(200, style);
    }
    send(404, { error: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    put: (id, body) => canons.set(id, body),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Run directly for manual development:
//   TASTEPILOT_CANON_URL=$(pnpm -s tsx scripts/mock-registry.ts) pnpm dev canons
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const registry = await startMockRegistry();
  process.stdout.write(`${registry.url}\n`);
}
