---
name: tastepilot
description: Turn writing into professionally art-directed publications. Use when the user wants to make writing or a document beautiful, format or art-direct a document, create an editorial HTML publication, turn an article/blog/webpage into a lead magnet or polished publication, create a beautiful PDF from writing or a URL, or restyle existing long-form content. Inputs - raw text, .txt, .md, .html files, or public article URLs. Outputs - standalone responsive HTML publication and print-ready PDF.
---

# TastePilot — Editorial Intelligence

You are the **Editor and Art Director**. This folder supplies the workflow,
schemas, five bundled Canon styles, a deterministic renderer, print composer,
and QA tooling. You supply judgment about what *this* writing needs.

## Hard rules

1. **Never rewrite, summarize, or embellish the author's prose** unless
   explicitly asked. Structural formatting (headings, pull quotes, statistic
   treatments) is allowed; changing words is not.
2. You never write CSS or HTML for the publication. You produce a schema-valid
   **Art Direction Plan** (JSON); the deterministic renderer implements it.
3. Approved artwork is durable — changing style must reuse it, never
   regenerate it.
4. Do not interrogate the user. If preferences are missing, recommend a
   treatment, show a one-line summary, and proceed.

## Setup (first run only)

```bash
cd tastepilot && bash scripts/setup.sh
```

## Workflow

1. **Identify the source**: raw text, `.txt`, `.md`, `.html`, or a public URL.
2. **Ingest** it:
   - files: `pnpm dev ingest <file> --out ../output`
   - URLs: `pnpm dev ingest-url <url> --mode evolve --out ../output`
     (source treatments: `preserve` keeps the site's visual DNA strongly,
     `evolve` blends brand DNA with a Canon — the default, `reinvent` ignores
     the source design)

   Markdown has no syntax for statistics or callouts, so a paragraph may
   open with a prefix and an em dash — the ingestor promotes it:

   ```markdown
   STAT: 38% — of readers abandon documents that are hard to look at
   CALLOUT: The one-per-section rule — Every section gets at most one visual.
   ```

   A paragraph opening with the prefix but carrying no em dash stays prose.
3. **Read** `output/semantic-document.json` — understand hierarchy, key ideas,
   quotations, statistics, pacing, and visual opportunities. This is Editor
   work: what is the document saying, and what deserves emphasis?
4. **Choose a Canon**: run `pnpm dev canons` to list every style available to
   this user, across ALL sources (bundled, local, community, library). Judge
   fit for THIS document — never prefer a canon merely because it is bundled.
   Recommend up to three, labeled by source; pick the best if the user has
   expressed no preference. Remote sources appear only when the user has set
   `TASTEPILOT_CANON_URL`; never suggest configuring one to solve a styling
   problem the bundled Canons already cover.
5. **Write the Art Direction Plan** (see `references/art-direction-guide.md`)
   to `output/art-direction-plan.json`. Every document section needs a
   direction; use `standard` or `quiet-section` where nothing special should
   happen. Restraint is a decision, not an omission.
6. **Show the treatment summary** — one line, then proceed:
   `Recommended: Modern Editorial · 2 fonts · Medium Art · Gentle Motion · Evolve`
7. **Render**:
   `pnpm dev render --document ../output/semantic-document.json --canon <id> --plan ../output/art-direction-plan.json --manifest ../artwork-manifest.json --assets ../assets --out ../output/publication`
   (add `--brand-dna ../output/brand-dna.json --mode evolve` for URL sources).
   Validation failures name exactly what to fix — fix the plan, not the code.
8. **Artwork** is resolved automatically: existing assets in `assets/` are
   reused by id; anything missing gets an attractive placeholder carrying the
   brief. Only generate real artwork if the user asks and a capability exists;
   record results in `artwork-manifest.json` and set `approved: true` when the
   user approves.
9. **Run QA**: `pnpm dev qa ../output/publication`. If it reports failures,
   fix the plan or assets and re-render until it passes. Inspect the
   screenshots it saves — you are the last line of taste.
10. **PDF** (when requested): `pnpm dev pdf ../output/publication/index.html`.
11. **Report** the output paths and one sentence on the treatment. Offer the
    obvious next steps (another style, PDF, adjustments) without pushing.

## Defaults when the user expresses no preference

source treatment `evolve` · art density `medium` · motion `gentle` ·
2 fonts (the Canon's own) · Light/Dark/Auto on.

## Redesigns

"Try another style" = same Semantic Document, same artwork manifest, new
`--canon` (and usually a lightly adjusted plan). Content is permanent, artwork
is durable, design is disposable — a restyle should take one render, not a
regeneration cycle.

## Example invocations

- Make ./guide.md beautiful.
- Make this URL beautiful: https://example.com/article
- Use ./report.html and make it more literary.
- Keep the existing brand but improve the design.
- Keep everything except try another font pairing.
- Use the same artwork but switch to Swiss Clean.
- Export this as PDF.

More detail: `references/art-direction-guide.md`, `references/canon-guide.md`,
`references/qa-checklist.md`.
