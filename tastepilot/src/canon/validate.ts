import { loadCanonDir } from "./load.js";
import type { CanonStyle } from "./schema.js";

export interface CanonValidationResult {
  ok: boolean;
  style?: CanonStyle;
  errors: string[];
}

/** Patterns that must never appear in canon text fields. */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<[a-z!/]/i, reason: "HTML markup" },
  { pattern: /javascript:/i, reason: "javascript: URL" },
  { pattern: /\bon\w+\s*=/i, reason: "event handler" },
  { pattern: /data:text\/html/i, reason: "data: HTML payload" },
  { pattern: /\$\{/, reason: "template injection" },
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|earlier|above|these)\s+instructions/i,
    reason: "prompt injection",
  },
];

/**
 * Scan every string in a parsed canon for content that must never appear.
 *
 * Exported because remote canons need exactly this: schema validation proves
 * the shape, the scan proves the *content* — a registry response is untrusted
 * input, and a "description" carrying agent instructions is the whole attack.
 */
export function scanCanonStrings(style: CanonStyle): string[] {
  const errors: string[] = [];
  scanStrings(style, "canon", errors);
  return errors;
}

function scanStrings(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "string") {
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      if (pattern.test(value)) {
        errors.push(`${path}: contains forbidden content (${reason})`);
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanStrings(v, `${path}[${i}]`, errors));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) scanStrings(v, `${path}.${k}`, errors);
  }
}

/**
 * Validate a canon folder: strict schema (unknown keys rejected) PLUS a
 * security scan of every string field. Canon data is configuration —
 * executable content, markup, and agent instructions are all refused.
 */
export async function validateCanon(dir: string): Promise<CanonValidationResult> {
  let style: CanonStyle;
  try {
    style = await loadCanonDir(dir);
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
  const errors = scanCanonStrings(style);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, style, errors: [] };
}
