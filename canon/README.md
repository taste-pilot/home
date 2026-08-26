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
| **Community Canon** | An open, growing repository of user-created styles | planned |
| **TastePilot Library** | Professionally researched, certified styles | planned |

Recommendations are source-neutral: when you say *Make it beautiful*, TastePilot considers everything available to you and suggests the best fits for *this* document.

## Creating a Canon

The authoring guide, schema reference, and `tastepilot canon validate` tooling ship with v0.1. The Community Canon repository — submissions, forks, attribution, automated validation — follows after launch.

> Human taste has always been cumulative. We just made it executable.
