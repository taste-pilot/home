# Canon styles

A Canon is a reusable editorial grammar: layout rules, typography
relationships, paired light/dark palettes, spacing rhythm, drop-cap behavior,
artwork rules, motion grammar, and print adaptation. It is not a template.

## Anatomy

```
canon/starter/<id>/
  manifest.json     id, name, author, tier, description, dropCaps, artwork grammar
  typography.json   families (with full offline fallbacks), scale, leading
  palette.json      paired light + dark tokens (never simple inversion)
  layout.json       measure, density, heading/quote/callout/statistic treatments
  motion.json       default level, max level, reveal style
  print.json        page size, margins, folios, print background
```

All files are strict-validated JSON. Unknown keys are rejected — a canon can
never carry CSS, scripts, or agent instructions.

## Sources

Canon loading is source-based and interchangeable:

| Source | Where | Notes |
|---|---|---|
| bundled | `canon/starter/` | five starters, always available offline |
| local | `canon/installed/` | user-installed or hand-made styles |
| community | remote registry | planned — the open Canon ecosystem |
| library | remote registry | planned — TastePilot's curated styles, via API entitlement |

`listCanons()` aggregates across every source with the source as metadata.
**Recommendation must be source-neutral** — judge fit for the document, never
prefer bundled for being local. The bundled five are onboarding, not a walled
garden.

## The five starters

| id | grammar in one line |
|---|---|
| `modern-editorial` | airy contemporary long-form, Fraunces + Inter, sculptural caps |
| `swiss-clean` | compact grid discipline, Archivo + Inter, no ornament, no caps |
| `literary-classic` | book measure and rhythm, EB Garamond alone, fleurons |
| `technical-journal` | numbered headings, IBM Plex trio, statistic panels |
| `playful-illustrated` | rounded, saturated, Baloo 2 + Nunito, background caps |

## Making a new canon

Copy a starter folder, change the `id`, and edit values within the schema.
Validate with `pnpm dev canon validate <dir>` (tooling milestone). Drop the
folder into `canon/installed/` to make it loadable as a `local` source.
