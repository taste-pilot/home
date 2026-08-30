import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, flagValue } from "../src/cli/args.js";
import { main } from "../src/cli/index.js";

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tp-cli-"));
}

/** Run main() with stdout/stderr captured, so tests stay quiet. */
async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
  try {
    return { code: await main(argv), out, err };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseArgs", () => {
  it("never mistakes a flag's value for a positional, in any order", () => {
    const before = parseArgs(["--out", "dir", "file.md"], ["out"]);
    const after = parseArgs(["file.md", "--out", "dir"], ["out"]);
    expect(before.positionals).toEqual(["file.md"]);
    expect(after.positionals).toEqual(["file.md"]);
    expect(flagValue(before, "out")).toBe("dir");
    expect(flagValue(after, "out")).toBe("dir");
  });

  it("accepts --name=value", () => {
    const args = parseArgs(["--out=dir", "file.md"], ["out"]);
    expect(args.positionals).toEqual(["file.md"]);
    expect(flagValue(args, "out")).toBe("dir");
  });

  it("treats a flag with no value as a boolean, not a value-eater", () => {
    const args = parseArgs(["--out", "--mode", "evolve"], ["out", "mode"]);
    expect(args.flags["out"]).toBe(true);
    expect(flagValue(args, "out")).toBeUndefined();
    expect(flagValue(args, "mode")).toBe("evolve");
  });

  it("collects unknown flags and swallows their values", () => {
    const args = parseArgs(["--ou", "dir", "file.md"], ["out"]);
    expect(args.unknown).toEqual(["--ou"]);
    expect(args.positionals).toEqual(["file.md"]);
  });
});

describe("tastepilot CLI", () => {
  it("ingests with the flag before the file", async () => {
    const dir = await scratch();
    const file = join(dir, "doc.md");
    await writeFile(file, "# Hello\n\nA paragraph.\n");
    const outDir = join(dir, "out");

    const { code, out } = await run("ingest", "--out", outDir, file);
    expect(code).toBe(0);
    expect(out).toMatch(/Semantic Document written/);
    const doc = JSON.parse(await readFile(join(outDir, "semantic-document.json"), "utf8"));
    expect(doc.metadata.title).toBe("Hello");
  });

  it("refuses a typo'd flag instead of ignoring it", async () => {
    const dir = await scratch();
    const file = join(dir, "doc.md");
    await writeFile(file, "# Hello\n");

    const { code, err } = await run("ingest", "--ou", join(dir, "out"), file);
    expect(code).toBe(1);
    expect(err).toMatch(/unknown option --ou/);
    expect(err).toMatch(/usage: tastepilot ingest/);
    expect(existsSync(join(dir, "out"))).toBe(false);
  });

  it("prints usage when a required positional is missing", async () => {
    for (const command of ["ingest", "pdf"]) {
      const { code, err } = await run(command);
      expect(code, command).toBe(1);
      expect(err, command).toMatch(new RegExp(`usage: tastepilot ${command}`));
    }
  });

  it("rejects a non-http url for ingest-url", async () => {
    const { code, err } = await run("ingest-url", "not-a-url");
    expect(code).toBe(1);
    expect(err).toMatch(/usage: tastepilot ingest-url/);
  });

  it("help and unknown commands behave", async () => {
    expect((await run("help")).code).toBe(0);
    const unknown = await run("nope");
    expect(unknown.code).toBe(1);
    expect(unknown.err).toMatch(/unknown or not-yet-implemented command/);
  });
});
