# Contributing to TastePilot

Thanks for your interest! TastePilot is in active pre-v0.1 construction, so the contribution surface is still settling.

## Right now

- **Issues and ideas** are welcome — especially around Canon design, editorial features, and agent workflows.
- **Canon style contributions** will open with the Community Canon after v0.1, with an authoring guide, strict schema validation, and attribution/fork support. See [`canon/README.md`](canon/README.md).
- **Code contributions**: hold tight until the v0.1 engine lands and this guide is expanded with setup, architecture, and test instructions.

## Ground rules (already fixed)

These architectural rules are not up for debate in PRs:

1. The AI never emits CSS — art direction is schema-validated JSON; the renderer is deterministic.
2. Source prose is never rewritten unless the user explicitly asks.
3. Changing Canon never deletes or regenerates approved artwork.
4. Local output has zero remote dependency; exported HTML is framework-free.
5. Canon data is configuration, never executable code.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
