/**
 * One argument grammar for every command.
 *
 * The CLI used to pick positionals with `rest.find(a => !a.startsWith("--"))`,
 * which cannot tell an argument from a flag's value: `ingest --out dir file.md`
 * ingested `dir`. A flag consumes the following token unless that token is
 * itself a flag, so option order never changes what the positionals are.
 */
export interface ParsedArgs {
  readonly positionals: ReadonlyArray<string>;
  /** `--name value` and `--name=value` yield a string; a bare `--name` yields true. */
  readonly flags: Readonly<Record<string, string | true>>;
  /** Flags the command does not define, in the order given. */
  readonly unknown: ReadonlyArray<string>;
}

export function parseArgs(argv: readonly string[], known: readonly string[] = []): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  const unknown: string[] = [];
  const isKnown = (name: string) => known.length === 0 || known.includes(name);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    const name = eq >= 0 ? body.slice(0, eq) : body;
    if (!isKnown(name)) {
      unknown.push(`--${name}`);
      // Still consume an attached value so it is not mistaken for a positional.
      if (eq < 0 && argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) i++;
      continue;
    }
    if (eq >= 0) {
      flags[name] = body.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) {
      flags[name] = argv[++i]!;
    } else {
      flags[name] = true;
    }
  }
  return { positionals, flags, unknown };
}

/** A flag's value, or undefined when absent or given without one. */
export function flagValue(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}
