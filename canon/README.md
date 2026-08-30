# The Canon

A Canon style is not a page template. It's a **reusable editorial grammar**: a coherent visual language plus the rules governing when and why its elements should be used — layout behavior, typography relationships, paired light/dark palettes, spacing rhythm, drop-cap behavior, illustration placement rules, motion rules, and print adaptation.

> We don't start from knobs. We start from canons.

## Where the styles live

The five **starter Canons** are bundled inside the Skilllet itself, so it works completely offline:

```
tastepilot/canon/starter/
├── modern-editorial/
├── swiss-clean/
├── literary-classic/
├── technical-journal/
└── playful-illustrated/
```

Every Canon is pure structured configuration — JSON validated against strict schemas. Canons never contain executable scripts, remote prompts, or arbitrary HTML/JS.

## Canon sources

The starters are onboarding, not a walled garden. Canon loading is built on interchangeable **sources**:

| Source | What it is | Status |
|---|---|---|
| **Bundled** | The five starters above — always available, offline | v0.1 |
| **Custom / local** | Your own Canon folders, installed into your project | v0.1 |
| **Community Canon** | An open, growing repository of user-created styles | client shipped; repository planned |
| **TastePilot Library** | Professionally researched, certified styles | client shipped; service planned |

Recommendations are source-neutral: when you say *Make it beautiful*, TastePilot considers everything available to you and suggests the best fits for *this* document.

## Remote registries

Remote sources are optional and off by default. Point TastePilot at a registry and its styles join the list:

```bash
export TASTEPILOT_CANON_URL=https://registry.example
tastepilot canons                       # remote styles appear, labeled by source
tastepilot canon install some-style     # by id, or some-style@1.2.0 to pin a version
```

With the variable unset there is no remote source in the chain at all — not a disabled one, an absent one. Everything below is what the client does when you do configure one:

- **Structured data only.** A response is parsed as JSON and validated against the same strict schemas a local Canon faces. Unknown keys are rejected.
- **Nothing fetched is executed.** Remote text is scanned for markup, scripts, and agent instructions before it goes anywhere near the renderer or your agent, and a Canon carrying any is refused rather than cached.
- **Versions are pinnable**, and a pinned version already on disk is served without a request.
- **Offline is not an error.** Fetched Canons are cached under `tastepilot/canon/cache/`; when the registry cannot be reached, the cache answers. A cache entry is re-validated on the way out, because a file on disk can be edited.
- **A registry never outranks what you already have.** It is one source among several, consulted in order.

## Creating a Canon

The authoring guide, schema reference, and `tastepilot canon validate` tooling ship with v0.1. The registry client ships with v0.2. The Community Canon repository itself — submissions, forks, attribution, automated validation — follows after launch.

> Human taste has always been cumulative. We just made it executable.
