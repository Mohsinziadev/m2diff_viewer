# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Side-by-side connector strip: curved bands link each change block across the panes, with » / « arrows like an IDE merge view. Turn it off with `connectors={false}`.
- Linked hover: pointing at a change (in either pane, or at its band or arrows) frames that block in both panes and highlights its band. Clicking a band selects the change.
- Moving between changes scrolls smoothly (instant with `prefers-reduced-motion`) and briefly flashes the change it lands on.
- Command palette (`Mod+K` / `Mod+Shift+P`, toolbar button, `openCommandPalette()`): fuzzy search over every action, `:` to go to a line, `#` to jump to a difference, recently used commands first.
- Line links: click line numbers to select (shift-click extends); `selection`/`onSelectionChange` props and `syncHash` for GitHub-style `#L12` / `#R10-R20` URLs.
- IDE-style status bar: `Diff 2 / 5` picker, cursor `Ln, Col`, line selection, detected indentation (`detectIndent` in core), clickable language and comparison time (`useDiff` now returns `duration`).
- Landing page at [m2toolkit.com/npm-packages/m2diff-viewer](https://www.m2toolkit.com/npm-packages/m2diff-viewer): the demo is now a prerendered, Warp-style page with the live playground, quick start, API reference and FAQ (`npm run build:site`). `homepage`, `repository` and `bugs` are set in `package.json`.
- `onApplyChange` on `<DiffViewer>` turns the arrows into buttons that copy a change to the other side; `applyChange(result, index, target)` in `m2diff-viewer/core` computes the new text.

## 0.1.0

Initial release.

### Added

- `m2diff-viewer/core`: framework-independent comparison engine.
  - Line diff (Myers via `diff`) with prefix/suffix trimming and unique-line filtering.
  - Similarity-based alignment of edited lines; word and character highlighting.
  - Whitespace (`trim`, `collapse`, `all`), case and line-ending options that never modify displayed text.
  - Size and time safeguards with warnings.
  - Unified patch output; search; folding; inline layout; JSON statistics report.
  - Async and Web Worker differs with cancellation.
- JSON comparison: tolerant JSON/JSONC parser with located errors, structural diff with path patterns (`*`, `[*]`, `**`), ignored paths, and ordered, unordered or keyed arrays. Includes a normalized text view.
- CSV comparison: RFC 4180 parser with delimiter detection and located errors; row matching by key columns, sequence or multiset; cell-level changes; column changes.
- `StructuredFormat` adapter interface with JSON, JSONC and `.env` implementations.
- React components:
  - `DiffViewer`: side-by-side, inline, unified and auto views; toolbar; search; navigation; folding; overview ruler; export; status bar; keyboard shortcuts; imperative handle; virtualization.
  - `JsonDiffViewer`, `CsvDiffViewer`, `DiffStats`.
  - `useDiff` and `useSyntaxTokens` hooks.
- Syntax highlighting adapters: `m2diff-viewer/highlight-js` (lazy grammars) and `m2diff-viewer/shiki`.
- Stylesheet with light, dark and auto themes driven by CSS variables, with WCAG AA contrast verified by tests.
