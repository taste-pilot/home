# QA checklist

`pnpm dev qa <publication-dir>` automates the mechanical checks and saves
desktop/tablet/mobile screenshots plus `qa/qa-report.json`.

## Automated (fix failures, then re-render)

- horizontal overflow at 1440 / 1024 / 390
- broken or zero-size images
- body text squeezed narrow by floats
- elements rendered outside the viewport
- Light/Dark/Auto control functional
- nothing left invisible under `prefers-reduced-motion`

## Your eyes (look at the screenshots)

- Does the opening feel like an opening?
- Is any section visually exhausting? Two eventful sections in a row need
  quiet after them.
- Drop cap: does it collide with the second paragraph or look orphaned?
- Artwork placement: does text wrap comfortably, or pinch?
- Contrast in BOTH themes — flip to dark and look again.
- Mobile: artwork linearized, measure comfortable, nothing cramped.

## PDF (when produced)

- open it — page breaks land between ideas, not through figures
- captions sit with their images
- no blank-page runs, no clipped edges
- print palette is the light palette

The publication is done when QA passes AND you would show it to its author
with pride. "I would never have made this myself" is the bar.
