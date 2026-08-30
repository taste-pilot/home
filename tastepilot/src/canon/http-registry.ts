import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CanonStyleSchema, type CanonStyle } from "./schema.js";
import { scanCanonStrings } from "./validate.js";
import type { CanonRegistry } from "./registry.js";
import type { CanonSummary } from "./load.js";

/**
 * The remote half of the Canon sources: Community and Library styles served by
 * a registry API.
 *
 * Everything here treats the response as hostile input. A registry can serve
 * structured Canon data and nothing else — the payload is parsed as JSON,
 * validated against the same strict schemas a local Canon faces, and scanned
 * for markup, scripts, and agent instructions before it is allowed anywhere
 * near the renderer or the agent. Nothing fetched is ever executed.
 *
 * Remote is also strictly optional. Without configuration there is no remote
 * source at all, so the offline promise is structural, not a policy.
 */

/** Registry base URL, when the user has configured one. */
export const CANON_URL_ENV = "TASTEPILOT_CANON_URL";

export interface HttpCanonRegistryOptions {
  /** Where cached canons live. Defaults to <package>/canon/cache. */
  cacheDir?: string;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Largest response we will read, in bytes. */
  maxBytes?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const SummarySchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .max(64),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
  })
  .strict();

const ListSchema = z.object({ canons: z.array(SummarySchema) }).strict();

/**
 * Why a fetch failed, because the two cases deserve opposite treatment.
 *
 * "unavailable" — no network, a 404, a timeout. Ordinary; fall back to cache
 * and carry on, because the offline promise says a missing registry is not a
 * broken tool.
 *
 * "refused" — the registry answered, and the answer was not acceptable Canon
 * data. Never fall back, never cache, never quietly substitute: a registry
 * serving forbidden content is exactly what the user needs to hear about.
 */
export class CanonRegistryError extends Error {
  constructor(
    message: string,
    readonly reason: "unavailable" | "refused",
  ) {
    super(message);
    this.name = "CanonRegistryError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;

export class HttpCanonRegistry implements CanonRegistry {
  private readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, options: HttpCanonRegistryOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.cacheDir = options.cacheDir ?? defaultCacheDir();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /** Registry listing, falling back to whatever the cache already holds. */
  async list(): Promise<CanonSummary[]> {
    try {
      const body = await this.get(`${this.baseUrl}/canons`);
      const parsed = ListSchema.parse(body);
      return parsed.canons.map((c) => ({ ...c, source: "community" as const }));
    } catch {
      // Offline is not an error: a registry that cannot be reached simply
      // contributes whatever was already fetched.
      return this.listCached();
    }
  }

  /**
   * One canon, by id and optional version.
   *
   * A cached version is served without a request — canon data at a given
   * version is immutable, so re-fetching it would only cost latency.
   */
  async fetch(id: string, version?: string): Promise<CanonStyle> {
    if (version) {
      const cached = await this.readCache(id, version);
      if (cached) return cached;
    }
    const url = version
      ? `${this.baseUrl}/canons/${encodeURIComponent(id)}/${encodeURIComponent(version)}`
      : `${this.baseUrl}/canons/${encodeURIComponent(id)}`;

    let body: unknown;
    try {
      body = await this.get(url);
    } catch (err) {
      // Unreachable, not untrustworthy: serve what we already have.
      const cached = await this.readLatestCached(id);
      if (cached) return cached;
      throw new CanonRegistryError(
        `canon "${id}" could not be fetched: ${(err as Error).message}`,
        "unavailable",
      );
    }
    const style = validateRemoteCanon(body, id);
    await this.writeCache(style);
    return style;
  }

  private async get(url: string): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    const text = await readCapped(response, this.maxBytes);
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`${url} did not return JSON: ${(err as Error).message}`);
    }
  }

  private canonCachePath(id: string, version: string): string {
    return join(this.cacheDir, id, `${version}.json`);
  }

  /**
   * A cached canon, re-validated on the way out — a cache entry is a file on
   * disk, and files on disk can be edited.
   *
   * A corrupt or stale-shaped entry is treated as a cache miss and re-fetched,
   * because a truncated write is far likelier than an attack. Forbidden
   * *content* is not: that is the one thing this cache must never hand back,
   * so it is refused out loud instead of being quietly replaced.
   */
  private async readCache(id: string, version: string): Promise<CanonStyle | undefined> {
    let parsed;
    try {
      const raw = await readFile(this.canonCachePath(id, version), "utf8");
      parsed = CanonStyleSchema.safeParse(JSON.parse(raw));
    } catch {
      return undefined;
    }
    if (!parsed.success || parsed.data.manifest.id !== id) return undefined;

    const forbidden = scanCanonStrings(parsed.data);
    if (forbidden.length > 0) {
      throw new CanonRegistryError(
        `cached canon "${id}" carries forbidden content — delete it and re-fetch:\n` +
          forbidden.map((e) => `  - ${e}`).join("\n"),
        "refused",
      );
    }
    return parsed.data;
  }

  /** The highest cached version of a canon, for offline fallback. */
  private async readLatestCached(id: string): Promise<CanonStyle | undefined> {
    let versions: string[];
    try {
      versions = (await readdir(join(this.cacheDir, id)))
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length));
    } catch {
      return undefined;
    }
    const latest = versions.sort(compareVersions).pop();
    return latest ? this.readCache(id, latest) : undefined;
  }

  private async listCached(): Promise<CanonSummary[]> {
    let ids: string[];
    try {
      ids = await readdir(this.cacheDir);
    } catch {
      return [];
    }
    const summaries: CanonSummary[] = [];
    for (const id of ids) {
      const style = await this.readLatestCached(id);
      if (!style) continue;
      summaries.push({
        id: style.manifest.id,
        name: style.manifest.name,
        version: style.manifest.version,
        source: "community",
        description: style.manifest.description,
        tags: style.manifest.tags,
      });
    }
    return summaries.sort((a, b) => a.id.localeCompare(b.id));
  }

  private async writeCache(style: CanonStyle): Promise<void> {
    const path = this.canonCachePath(style.manifest.id, style.manifest.version);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(style, null, 2) + "\n", "utf8");
  }
}

/** Parse, validate and scan a registry response. Throws with a usable reason. */
export function validateRemoteCanon(body: unknown, expectedId: string): CanonStyle {
  const result = CanonStyleSchema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new CanonRegistryError(`registry returned an invalid canon:\n${issues}`, "refused");
  }
  const style = result.data;
  if (style.manifest.id !== expectedId) {
    throw new CanonRegistryError(
      `registry returned canon "${style.manifest.id}" when asked for "${expectedId}"`,
      "refused",
    );
  }
  const forbidden = scanCanonStrings(style);
  if (forbidden.length > 0) {
    throw new CanonRegistryError(
      `registry canon "${expectedId}" carries forbidden content:\n` +
        forbidden.map((e) => `  - ${e}`).join("\n"),
      "refused",
    );
  }
  return style;
}

/** Read a response body, refusing anything past the cap. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new Error(`response is ${declared} bytes, over the ${maxBytes} byte limit`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new Error(`response exceeds the ${maxBytes} byte limit`);
  }
  return text;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function defaultCacheDir(): string {
  return join(packageRootFromHere(), "canon", "cache");
}

function packageRootFromHere(): string {
  return join(dirname(new URL(import.meta.url).pathname), "..", "..");
}
