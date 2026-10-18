# Architecture and design decisions

## Layout

One npm package with four entry points instead of a multi-package monorepo. The pieces are released together, so a single version, a single install and subpath exports keep things simple for consumers. The engine still has no React dependency, enforced by the smoke test:

```text
src/
  core/          framework-free engine           → m2diff-viewer/core
    diff.ts        line diff, alignment, intraline ranges, stats, safeguards
    align.ts       similarity pairing of edited lines
    intraline.ts   word/character ranges
    fold.ts        collapsible unchanged regions
    inline.ts      inline (unified column) layout
    patch.ts       unified diff output
    search.ts      search across sides
    report.ts      JSON statistics export
    highlight.ts   SyntaxHighlighter contract + token/decoration merge
    languages.ts   ids, aliases, file-name inference
    async.ts       async differ, Web Worker differ + worker handler
    json/          tolerant JSON(C) parser, path patterns, structural value diff
    csv/           RFC 4180 parser, row/cell diff
    structured.ts  StructuredFormat adapter interface (JSON, JSONC, .env)
  react/         React UI                        → m2diff-viewer
  highlight-js/  highlight.js adapter            → m2diff-viewer/highlight-js
  shiki/         Shiki adapter                   → m2diff-viewer/shiki
  styles/        stylesheet                      → m2diff-viewer/styles.css
```

## Comparison engine

- **Algorithm.** Myers' O(ND) algorithm from the [`diff`](https://github.com/kpdecker/jsdiff) package (jsdiff) runs on interned line ids. I didn't write a new diff algorithm: jsdiff is mature, widely used, and supports time and edit-length budgets.
- **Speed-ups.** These are standard and preserve minimality:
  - Common prefix and suffix are trimmed before the diff.
  - Lines that occur on only one side are set aside before Myers runs, as xdiff and GNU diff do. They cannot be part of a longest common subsequence, so the edit script stays minimal. `tests/diff.test.ts` checks this against unfiltered Myers on 200 random inputs.
  - In the benchmarks, this took a fully rewritten 5,000-line file from about 2 s to about 140 ms.
- **Comparison keys.** Whitespace, case and line-ending options only change each line's comparison key. Displayed text is never modified. Rows that are equal by key but differ in text are flagged `ignored`. The same mechanism (`compareKeys`) lets the JSON text view align ignored paths.
- **Alignment.** Inside a change block, removed and added lines are paired with an order-preserving optimal alignment that maximizes the total similarity of pairs above a threshold (Sørensen–Dice over character bigrams). This is what lets edited lines sit on the same row in side-by-side view, like IDE diff tools, rather than being zipped in order. Blocks larger than `maxAlignCells` fall back to in-order pairing.
- **Intraline.** Word or character ranges come from jsdiff's `diffWordsWithSpace` and `diffChars`, which tokenize by code point.
- **Async API and cancellation.** jsdiff's own async mode yields with one `setTimeout` per edit-length step. Browsers clamp nested timeouts to about 4 ms, so a large diff would take tens of seconds; it isn't used. Instead:
  - synchronous comparison bounded by a time budget, with a correct (non-minimal) fallback;
  - `computeDiffAsync`, which defers work off the render path with stale-result protection;
  - `createWorkerDiffer`, which offers true cancellation by terminating the worker.

## Syntax highlighting: engine evaluation

| Criterion | highlight.js 11 | Shiki | Prism |
| --- | --- | --- | --- |
| Language coverage | ~190 grammars, all in the package | 200+ TextMate grammars (VS Code quality) | ~290 via plugins |
| Runtime | Synchronous, plain JS, works in Node and browsers | Async setup; Oniguruma WASM or JS regex engine | Synchronous, but relies on a global `Prism` and side-effect language imports |
| Lazy grammars | One ES module per language, so `import()` works | `loadLanguage` with bundled grammar imports | Side-effect imports, awkward to lazy-load |
| Output | HTML string | Per-line tokens with colors | Token tree |
| Bundle | Core plus adapter measured at 10.6 kB gzip; grammars about 1–5 kB each | Larger core plus engine; grammars are JSON and often bigger | Small core |

**Decision.** highlight.js is the default adapter. It's synchronous, so server rendering includes highlighting once a grammar is loaded. It loads each grammar as a separate chunk from the consumer's own bundle, with no CDN or remote code. Colors come from contrast-checked CSS variables instead of a third-party theme. Its HTML output is converted into per-line tokens by a small, well-defined parser; highlight.js escapes only `& < > " '`.

Shiki is supported through a structural adapter (`m2diff-viewer/shiki`) for teams that want VS Code-accurate colors. The package does not depend on Shiki; consumers create the highlighter.

**Adapter contract.** `resolve`, `isLoaded`, `load` (async, on demand), `tokenize` (sync), and optional `detect` and `languages`.

- If a language is unknown, not yet loaded, or the adapter throws, the line falls back to plain text.
- If tokens don't reproduce a line exactly, they are discarded for that line, so highlighting can never change the displayed text.
- Diff and search highlights are merged with syntax tokens by `splitPieces`, which splits only at token and range boundaries.

## Rendering

- **Fixed-height rows.** Every row (line, filler or fold) has the same height. This makes virtualization exact: offsets are `index × rowHeight`, and there is no layout measuring. Long lines scroll horizontally rather than wrapping (wrapping is on the roadmap).
- **Side-by-side scrolling.** The view uses two native scroll containers with synchronized `scrollTop` (and optionally `scrollLeft`), so each pane keeps native horizontal scrolling. Echoed scroll events are suppressed only when a position actually changed, which avoids feedback loops when one pane is narrower.
- **Gutter.** Line numbers and signs are CSS generated content in a sticky gutter. They stay visible during horizontal scrolling and are excluded from copied text.
- **Large documents.** Above `highlightLimit`, syntax highlighting runs per visible line with a bounded cache.

## Structured data

- **JSON.** A hand-written parser gives line and column errors that are identical in every JS engine, and supports JSONC. Valid strict JSON goes through `JSON.parse` first for speed. `__proto__` keys are kept as data.
- **Value diff.** The structural diff works on any JSON-like value tree (`diffValues`), so other formats only need a parser (`StructuredFormat`). Arrays can be ordered (sequence diff over subtree fingerprints that skip ignored paths), unordered (multiset), or keyed by an identity field.
- **CSV.** A state-machine parser handles RFC 4180 quoting, with errors located by record and line. Rows are matched by key columns, by sequence diff (pairing rows that share at least a third of their cells), or as a multiset. Columns are matched by header name.

## Verification

- **Unit and integration tests** (Vitest + jsdom) cover:
  - the engine, including patch application fuzzing and minimality checks;
  - JSON, CSV and `.env`;
  - the highlight.js adapter (every bundled grammar loads) and the Shiki adapter (real Shiki);
  - React rendering, keyboard, folding, search and export;
  - axe-core accessibility checks;
  - WCAG contrast of the shipped palettes;
  - SSR in a pure Node environment.
- **Package checks.** `publint --strict`, arethetypeswrong (node16 + bundler), size budgets per entry point, and a smoke test. The smoke test installs the packed tarball into a fresh project, type-checks the examples with `skipLibCheck: false`, server-renders them through both ESM and CommonJS, and runs the engine and highlight.js adapter in Node.
