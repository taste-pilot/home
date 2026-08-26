# Contributing to TastePilot

Thanks for your interest! Issues, ideas, and Canon designs are all welcome.

## Repository layout

```
tastepilot/        the Skilllet users copy into their projects
  SKILL.md         the agent orchestration contract
  src/             TypeScript engine (ingest → semantic → canon → art-direction → renderer → print → qa)
  canon/starter/   the five bundled Canon styles
  renderer/        static CSS/JS shipped into publications
  references/      guidance the agent loads on demand
  fixtures/        test inputs
  tests/           Vitest unit tests + Playwright browser tests
site/              tastepilot.org (hand-built HTML/CSS, GitHub Pages)
canon/             what a Canon is + the source ecosystem
examples/demo/     the three-canon demo output (rebuilt with pnpm demo)
```

## Development

```bash
cd tastepilot
bash scripts/setup.sh     # Node 20+, pnpm, Chromium
pnpm test                 # unit tests
pnpm test:browser         # Playwright visual/QA/print tests
pnpm typecheck && pnpm lint
pnpm demo                 # rebuild examples/demo + site/demo
```

## Ground rules (not up for debate in PRs)

1. The AI never emits CSS — art direction is schema-validated JSON; the renderer is deterministic.
2. Source prose is never rewritten unless the user explicitly asks.
3. Changing Canon never deletes or regenerates approved artwork.
4. Local output has zero remote dependency; exported HTML is framework-free.
5. Canon data is configuration, never executable code or agent instructions.
6. No scroll-jacking; `prefers-reduced-motion` is honored; print hides nothing.
7. No hosting-provider URLs in public links, Canon references, examples, or
   exported documents — relative paths, or `https://tastepilot.org`.

## Contributing a Canon style

See [`canon/README.md`](canon/README.md) and
[`tastepilot/references/canon-guide.md`](tastepilot/references/canon-guide.md).
Validate with `pnpm dev canon validate <dir>` — strict schemas plus a security
scan; canons carrying markup, scripts, or agent instructions are refused. The
open Community Canon repository (submissions, forks, attribution) opens after
v0.1.

## License

By contributing, you agree your contributions are licensed under the
[MIT License](LICENSE).
