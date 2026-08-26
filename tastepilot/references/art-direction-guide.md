# Writing an Art Direction Plan

The plan is structured editorial judgment, validated against a strict schema
(`src/art-direction/schema.ts`). Arbitrary properties — including anything
CSS-shaped — are rejected. You choose from controlled vocabularies only.

## Shape

```json
{
  "schemaVersion": 1,
  "style": "modern-editorial",
  "artDensity": "medium",
  "motion": "gentle",
  "sections": [
    {
      "sectionId": "<must exist in the semantic document>",
      "composition": "opening-editorial",
      "dropCap": "classic-5",
      "artwork": [
        {
          "id": "stable-artwork-id",
          "placement": "right",
          "wrap": "silhouette",
          "size": "medium",
          "brief": "One-sentence editorial brief for the illustration.",
          "nearBlockId": "optional-anchor-block-id"
        }
      ],
      "pullQuotes": [{ "blockId": "a-quote-or-short-paragraph-id" }],
      "statistics": [{ "blockId": "a-statistic-id", "treatment": "oversized" }],
      "callouts": [{ "blockId": "a-callout-id", "treatment": "panel" }]
    }
  ]
}
```

## Vocabularies

- **composition**: `standard` · `opening-editorial` · `margin-art-left` ·
  `margin-art-right` · `full-width-art` · `pull-quote-break` ·
  `statistic-break` · `two-column-callout` · `quiet-section` · `diagram-section`
- **dropCap**: `none` · `classic-3` · `classic-5` · `raised` · `sunken` ·
  `outline` · `background` · `margin` · `sculptural`
- **artwork placement**: `left` · `right` · `full` · `background` · `inline`;
  **wrap**: `none` · `rectangle` · `silhouette`; **size**: `small` · `medium` · `large`
- **motion**: `none` · `gentle` · `editorial` · `cinematic`

## Judgment guidance

- **Pacing over decoration.** After two visually eventful sections, give the
  reader quiet (`quiet-section`). A publication with no quiet sections has no
  loud ones.
- **One drop cap says opening.** Use it at the opening section and at most one
  major narrative turn. Respect the canon's `dropCaps.allowed` list and lean
  toward its `preferred`.
- **Pull quotes are sparse.** Elevate a line only when it can stand alone; a
  paragraph over ~240 characters will not be elevated.
- **Statistics deserve events.** A striking figure after a dense passage is a
  better visual interruption than another illustration.
- **Artwork ids are permanent names.** Choose descriptive, stable ids
  (`history-telescope`, not `img1`) — the manifest reuses them across
  redesigns forever.
- **Honor the canon's artwork grammar.** Check `manifest.json` of the chosen
  canon: `artwork.density`, `wrapAllowed`, and `placements` tell you how much
  and where. `artDensity` in your plan should not exceed the canon's density.
- **Respect the motion grammar.** Never plan a motion level above the canon's
  `motion.max`.

## Validation

The renderer validates the plan against the document: every document section
needs a direction, and every referenced block id must exist. Error messages
name the missing/unknown ids — fix the plan and re-run.
