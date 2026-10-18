# m2diff-viewer

A code and data diff viewer for React, built on a comparison engine that has no framework dependency.

**[Live preview and docs →](https://www.m2toolkit.com/npm-packages/m2diff-viewer)** · [npm](https://www.npmjs.com/package/m2diff-viewer) · [GitHub](https://github.com/Mohsinziadev/m2diff_viewer)

- **Three views.** Side-by-side (with synchronized scrolling and resizable panes), inline, and unified patch.
- **Edit-aware alignment.** Edited lines are paired by similarity and highlighted at word or character level. Lines with no counterpart get filler rows, so unequal line counts never break alignment.
- **Any language.** The comparison is language-agnostic. Syntax highlighting is a pluggable adapter: highlight.js (grammars lazy-loaded on demand) or Shiki. Anything unknown falls back to plain text.
- **Structured data.** JSON (with JSONC and `.env` support) is compared as a tree of paths, with ignorable paths and order-insensitive or keyed arrays. CSV is compared by rows and cells, matched by key columns, position or as a set.
- **Review tooling.** Collapsible unchanged regions, previous/next difference, search across either or both sides, an overview ruler, keyboard shortcuts, and copy/download of the unified diff and statistics.
- **Built for large inputs.** Virtualized rendering, highlighting of visible lines only, size and time limits, and optional Web Worker comparison with real cancellation. See the [benchmarks](docs/benchmarks.md).
- **Accessible.** Keyboard operable, screen-reader labels and announcements, and colors that meet WCAG AA contrast in both themes (checked in tests). Changes never rely on color alone.

Everything runs in the browser (or Node). Nothing is uploaded, and no grammar or code is fetched from a CDN.

```bash
npm install m2diff-viewer
# optional, for syntax highlighting:
npm install highlight.js        # or: npm install shiki
```

## Contents

- [Quick start](#quick-start)
- [Views](#views)
- [Syntax highlighting & languages](#syntax-highlighting--languages)
- [Comparison options](#comparison-options)
- [JSON comparison](#json-comparison)
- [CSV comparison](#csv-comparison)
- [Other structured formats](#other-structured-formats)
- [API reference](#api-reference)
- [Headless engine](#headless-engine-m2diff-viewercore)
- [Theming & customization](#theming--customization)
- [Large inputs & performance](#large-inputs--performance)
- [Accessibility](#accessibility)
- [Frameworks, SSR & browsers](#frameworks-ssr--browsers)
- [Troubleshooting](#troubleshooting)
- [Use cases](#use-cases)
- [Limitations & roadmap](#limitations--roadmap)
- [Development](#development)

## Quick start

```tsx
import { DiffViewer } from 'm2diff-viewer';
import 'm2diff-viewer/styles.css';

export default function Example({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  return (
    <DiffViewer
      original={oldCode}
      modified={newCode}
      originalName="src/cart.ts"
      modifiedName="src/cart.ts"
      defaultView="split"
      theme="light"
      collapseUnchanged
      contextLines={3}
    />
  );
}
```

Add syntax highlighting with one line. Grammars are loaded the first time a language is shown:

```tsx
import { createHighlightJsAdapter } from 'm2diff-viewer/highlight-js';

const highlighter = createHighlightJsAdapter(); // create once, e.g. at module level

<DiffViewer original={a} modified={b} modifiedName="main.rs" highlighter={highlighter} />;
```

More complete, type-checked examples are in [`examples/`](examples): custom toolbar, Shiki, JSON/CSV, Web Worker, Next.js and headless usage. Try everything live on the [preview page](https://www.m2toolkit.com/npm-packages/m2diff-viewer), or run it locally with `npm install && npm run dev`.

## Views

| View | `view` value | Description |
| --- | --- | --- |
| Side-by-side | `split` | Original on the left, modified on the right. Vertical scrolling is always synchronized; horizontal sync can be toggled. Drag or use the arrow keys on the divider to resize. A connector strip between the panes links each change to its counterpart with » / « arrows (clickable when `onApplyChange` is set). Hovering a change frames it in both panes; clicking its band selects it. |
| Inline | `inline` | A single column. Each change block shows its removed lines, then its added lines, with both line numbers. |
| Unified patch | `unified` | The standard `diff -u` / `git diff` text, with file headers and `@@` hunk headers. |
| Auto (default) | `auto` | Side-by-side when the viewer is at least 720px wide, inline below that. |

Use `defaultView` for uncontrolled usage, or `view` together with `onViewChange` to control it. The toolbar hides controls that cannot have an effect, such as a view switcher when `view` is controlled without a change handler.

Row kinds you will see:

- **modified**: an edited line. Both sides are tinted, and the changed words or characters are highlighted.
- **added / removed**: a line that exists on one side only. The other side shows a hatched filler row.
- **replaced**: removed and added lines that share a row but are too different to be treated as an edit. They get no word highlighting.
- **≈**: lines that differ only in ways the options ignore, such as whitespace, case or an ignored JSON path. They are not counted as changes.

## Syntax highlighting & languages

The engine never needs a language. Highlighting goes through the `SyntaxHighlighter` adapter interface, which has two implementations:

| | `m2diff-viewer/highlight-js` | `m2diff-viewer/shiki` |
| --- | --- | --- |
| Engine | [highlight.js](https://highlightjs.org) 11 (sync, no WebAssembly) | [Shiki](https://shiki.style) (TextMate grammars, VS Code-accurate colors) |
| Install | `npm i highlight.js` (optional peer) | `npm i shiki` (you create the highlighter) |
| Cost in your bundle | about 10.6 kB gzip for adapter + highlight.js core, plus one lazy chunk per language actually viewed | 1.6 kB gzip adapter, plus Shiki itself |
| Colors | Our stylesheet's `--m2d-syn-*` variables (theme-aware, contrast-checked) | The Shiki themes you pass (`light` and `dark`) |
| Languages | 38 bundled loaders covering everything below, plus custom grammars | Everything Shiki supports, loaded on demand |

Bundle sizes are measured by `npm run size`; see [docs/architecture.md](docs/architecture.md) for why these engines were chosen.

```tsx
// highlight.js: lazy grammars (default), or pass your own fully loaded instance
createHighlightJsAdapter();
createHighlightJsAdapter({ hljs: myHljsInstance });
createHighlightJsAdapter({ languages: { abap: abapGrammar }, loaders: { cobol: () => import('highlightjs-cobol') } });
createHighlightJsAdapter({ detectLanguages: ['typescript', 'python', 'sql'] }); // candidates for language="auto"

// Shiki
import { createHighlighter } from 'shiki';
const shiki = await createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] });
createShikiAdapter(shiki, { themes: { light: 'github-light', dark: 'github-dark' } });
```

**Choosing the language.** Pass `language` as an id or alias (`typescript`, `ts`, `py`, `yml`, `c++`…). Without it, the language is inferred from `modifiedName` or `originalName`. `language="auto"` uses the highlighter's detection, which is optional and only picks a clear winner. The toolbar offers a language picker when a highlighter is set.

**Languages with built-in ids, aliases and file-extension mapping:** plaintext, JavaScript, JSX, TypeScript, TSX, JSON, JSONC, YAML, TOML, XML, HTML, CSS, SCSS, Less, Markdown, Python, Java, Kotlin, Scala, C, C++, C#, Objective-C, Swift, Go, Rust, PHP, Ruby, Perl, Lua, R, Dart, Elixir, Haskell, SQL, GraphQL, Bash, PowerShell, Dockerfile, Makefile, Nginx, INI, .env, Vue, Svelte, Diff, CSV and logs. Other names are passed through to the highlighter unchanged.

With highlight.js, Vue and Svelte are highlighted as HTML templates and TOML uses the INI grammar. Use the Shiki adapter for full single-file-component highlighting. CSV and log files are compared as plain text unless you use `<CsvDiffViewer>`.

Highlighting never changes the text. If an adapter returns tokens that don't reproduce a line exactly, that line is shown plain.

## Comparison options

Pass `options` (controlled) or `defaultOptions` to `<DiffViewer>`, or a `DiffOptions` object to `computeDiff`. The toolbar edits these options when they are uncontrolled, or when `onOptionsChange` is provided.

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `ignoreWhitespace` | `none`, `trim`, `collapse`, `all` | `none` | `trim` ignores leading and trailing whitespace. `collapse` also treats runs of whitespace as equal (like `diff -b`). `all` ignores every whitespace character (like `diff -w`). |
| `ignoreCase` | boolean | `false` | Case-insensitive comparison, for both lines and words. |
| `lineEndings` | `normalize`, `preserve` | `normalize` | `normalize` treats CRLF, LF and CR as equal and ignores a missing final newline. `preserve` reports line-ending changes. |
| `intraline` | `word`, `char`, `none` | `word` | Highlighting granularity inside edited lines. |
| `limits` | see [Large inputs](#large-inputs--performance) | | Size and time safeguards. |
| `compareKeys` | per-line custom keys | | Advanced: replace the comparison key of individual lines. Used internally for ignored JSON paths. |

Ignore options never modify what is displayed. Lines whose only differences are ignored stay visible with a `≈` marker, are counted as `ignoredLines`, and are not counted as changes.

`null` or `undefined` content means "the file does not exist". The result status is then `added` or `deleted`, and patches use `/dev/null`. An empty string is an empty file.

## JSON comparison

```tsx
import { JsonDiffViewer } from 'm2diff-viewer';

<JsonDiffViewer
  original={responseA} // JSON text, or { value } for already-parsed data
  modified={responseB}
  ignorePaths={['metadata.updatedAt', 'users[*].lastSeen', '$.request.timestamp']}
  arrayKeys={{ users: 'id' }} // match array items by identity, not position
  arrays="ordered" // or "unordered"
  sortKeys // the text view ignores key order (default)
/>;
```

- **Tree view.** Shows added, removed and changed paths with old → new values. Unchanged branches start collapsed, and a *Changes only* filter is available.
- **Text view.** A line diff of the normalized (pretty-printed) documents. It uses the same `DiffViewer`, so search, export and highlighting all work there.
- **Invalid JSON never throws.** The error is shown with its line and column, and the raw texts are compared instead. Set `jsonc` to accept comments and trailing commas.
- **Object key order never counts as a change** in the tree view. In the text view, keys are sorted unless `sortKeys={false}`.

### Path syntax

Patterns are matched against full paths from the root. A pattern does not match descendants unless you use `**`, and ignoring a path ignores its whole subtree.

| Pattern | Matches |
| --- | --- |
| `a.b.c`, `$.a.b.c` | That exact path (the `$` prefix is optional) |
| `items[0]` | A specific array index |
| `items[*]`, `a.*` | Any single index or key |
| `**.updatedAt` | `updatedAt` at any depth, including the root level |
| `["key.with.dots"]`, `['quoted']` | Keys that aren't identifiers |

Malformed patterns are reported in the viewer and in `structure.patternErrors`, never silently ignored. Reported paths use the same notation, for example `$.users[2]["first name"]`.

### Array matching

- **`ordered`** (default) uses a sequence diff, so inserting one element doesn't mark every following element as changed.
- **`unordered`** treats arrays as multisets and reports only elements missing on one side.
- **`arrayKeys`** pairs elements by an identity field (`{ 'orders[*].items': 'sku' }`), wherever they moved.

## CSV comparison

```tsx
import { CsvDiffViewer } from 'm2diff-viewer';

<CsvDiffViewer original={before} modified={after} keyColumns={['sku']} ignoreColumns={['updated_at']} trimCells />;
```

- **Parsing.** An RFC 4180 parser handles quoted delimiters, doubled quotes (`""`), newlines inside quotes, CRLF/LF/CR and a BOM. The delimiter is auto-detected among `,` `;` tab and `|`, or can be set with `delimiter`.
- **Row matching.** Choose key columns (`keyColumns`; row order then doesn't matter), `rowOrder: 'ordered'` (sequence diff that pairs edited rows) or `rowOrder: 'unordered'`. Users can switch the key column from the toolbar.
- **Columns.** With `header` (the default), columns are matched by name, so reordering columns is not a change, and added or removed columns are reported separately.
- **Errors.** Parse errors are reported with record and line numbers: an unterminated quote is fatal, while stray quotes and inconsistent column counts are warnings. Duplicate keys produce a warning and are matched in order.

## Other structured formats

The JSON tree works for any format that parses into a value tree. Implement `StructuredFormat`, which needs a `parse` function and optionally a `format` printer for the text view. Pass it to `<JsonDiffViewer format={…}>` or to `diffStructured`. A `.env` format (`envFormat`) is built in:

```ts
import YAML from 'yaml';
import type { StructuredFormat } from 'm2diff-viewer';

const yamlFormat: StructuredFormat = {
  id: 'yaml',
  label: 'YAML',
  language: 'yaml',
  parse(text) {
    try {
      return { ok: true, value: YAML.parse(text) };
    } catch (e) {
      return { ok: false, error: { message: String(e), line: 1, column: 1, offset: 0 } };
    }
  },
};

<JsonDiffViewer original={a} modified={b} format={yamlFormat} />;
```

## API reference

### Entry points

| Import | Contents | Requires |
| --- | --- | --- |
| `m2diff-viewer` | React components and hooks, plus everything from `/core` | `react` 18 or 19 |
| `m2diff-viewer/core` | The comparison engine: text, JSON, CSV, patch, search, folding, worker helpers | nothing (no React, no DOM) |
| `m2diff-viewer/highlight-js` | `createHighlightJsAdapter` | `highlight.js` 11 |
| `m2diff-viewer/shiki` | `createShikiAdapter` | a Shiki highlighter you create |
| `m2diff-viewer/styles.css` | The stylesheet (about 6.2 kB gzip) | |

All entries ship ESM and CommonJS builds with type declarations and source maps. Modules are preserved, so bundlers tree-shake unused parts.

### `<DiffViewer>`

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `original`, `modified` | `string \| null \| undefined` | — | `null`/`undefined` = file does not exist |
| `originalName`, `modifiedName` | `string` | | Header labels, patch headers, language inference |
| `originalLabel`, `modifiedLabel` | `ReactNode` | names | Custom header content |
| `language` / `onLanguageChange` | `string` | inferred | Id, alias or `auto`; controlled when both are set |
| `highlighter` | `SyntaxHighlighter \| null` | none | See [highlighting](#syntax-highlighting--languages) |
| `highlightLimit` | `number` | `10000` | Above this line count, only visible lines are highlighted |
| `view` / `defaultView` / `onViewChange` | `'split' \| 'inline' \| 'unified' \| 'auto'` | `auto` | |
| `options` / `defaultOptions` / `onOptionsChange` | `DiffOptions` | `{}` | See [options](#comparison-options) |
| `differ` | `Differ` | | Asynchronous comparison, e.g. `createWorkerDiffer(…)` |
| `collapseUnchanged` | `boolean` | `true` | Initial state; the toolbar can toggle it |
| `contextLines` | `number` | `3` | Unchanged lines kept around each change |
| `minCollapsedLines` | `number` | `4` | Smaller unchanged regions are never collapsed |
| `showLineNumbers` | `boolean` | `true` | |
| `overview` | `boolean` | `true` | Change markers along the right edge |
| `syncHorizontalScroll` | `boolean` | `true` | Initial state |
| `selection`, `defaultSelection`, `onSelectionChange` | `LineSelection \| null` | | Lines selected by clicking line numbers: `{ side, start, end }` |
| `syncHash` | `boolean \| string` | `false` | Mirror the line selection in the URL hash; a string prefixes the hash when a page has several viewers |
| `connectors` | `boolean` | `true` | Bands and » / « arrows between the side-by-side panes, linking each change to its counterpart |
| `toolbar` | `boolean \| ToolbarOptions` | `true` | `ToolbarOptions` toggles `navigation`, `view`, `whitespace`, `intraline`, `collapse`, `settings`, `search`, `export`, `commands`, `language` and `summary` individually |
| `toolbarEnd` | `ReactNode` | | Extra toolbar content |
| `statusBar` | `boolean` | `true` | Counts, warnings, language and line endings |
| `renderHeader` | `(info) => ReactNode` | | Replaces the file header row; return `null` to hide it |
| `renderFoldLabel` | `(fold) => ReactNode` | | Custom "N unchanged lines" label |
| `theme` | `'light' \| 'dark' \| 'auto'` | `auto` | `auto` follows `prefers-color-scheme` |
| `height` | `number \| string` | `560px` | `'auto'` grows with content and disables virtualization |
| `rowHeight` | `number` | `20` | Pixels; keep it in sync if you change fonts |
| `virtualize` | `boolean \| 'auto'` | `auto` | `auto` = on above 400 rows |
| `keyBindings` | `Partial<KeyBindings> \| false` | see below | |
| `className`, `classNames`, `style` | | | `classNames` slots: `root`, `toolbar`, `header`, `body`, `row`, `statusBar` |
| `aria-label` | `string` | `"Comparison"` | Accessible name of the viewer region |
| `onDiff` | `(result: DiffResult) => void` | | Called with each new result |
| `onError` | `(error: Error) => void` | | |
| `onNavigate` | `(e: { changeIndex, change }) => void` | | |
| `onExport` | `(e: ExportEvent) => boolean \| void` | | Return `false` to handle a copy/download yourself |
| `onApplyChange` | `(e: ApplyChangeEvent) => void` | | Makes the connector arrows buttons: » copies a change into the modified text, « into the original. `e.target` is the side to update and `e.text` its new content |

**Imperative handle** (`ref`): `result`, `nextChange()`, `previousChange()`, `goToChange(i)`, `expandAll()`, `collapseAll()`, `openSearch(query?)`, `openCommandPalette(query?)`, `getUnifiedPatch(options?)` and `getReport()`. Use it to build your own controls around a minimal viewer (`toolbar={false} statusBar={false}`); see [examples/custom-toolbar.tsx](examples/custom-toolbar.tsx).

**Keyboard shortcuts.** These are active while focus is inside the viewer. `Mod` is ⌘ on macOS and Ctrl elsewhere. Override them per action with `keyBindings`, or disable them with `false`.

| Action | Default |
| --- | --- |
| `nextChange` / `previousChange` | `F7`, `Alt+↓` / `Shift+F7`, `Alt+↑` |
| `openSearch` | `Mod+F` |
| `nextMatch` / `previousMatch` | `F3`, `Mod+G` / `Shift+F3`, `Mod+Shift+G` (and `Enter` / `Shift+Enter` in the search box) |
| `commandPalette` | `Mod+K`, `Mod+Shift+P` |

`Esc` clears a line selection.

**Command palette.** Every action in one fuzzy-searchable list: navigation, view, whitespace and highlighting modes, folding, export, merge (with `onApplyChange`), line-selection actions and languages. Start the query with `:` to go to a line (`:42`, `:L42` for the original side, `:R10-20` for a range) or with `#` to jump to a difference. Open it from code with `ref.current.openCommandPalette(query?)`.

**Line links.** Click a line number to select it, shift-click to extend, click again or press `Esc` to clear. With `syncHash`, the selection is mirrored in the URL GitHub-style (`#L12` original, `#R10-R20` modified), so links open with the lines selected and in view.

**Status bar.** Shows `+/−` counts, the current difference (`Diff 2 / 5`, click to pick another), the cursor position (`Ln 42, Col 7`) or line selection, the detected indentation, line endings, the language (click to change it) and how long the comparison took.

Search supports case sensitivity, whole words and regular expressions (an invalid pattern is reported, not thrown), across either or both sides. Moving to a match or a change inside a collapsed region expands it.

**Exports** (toolbar menu): copy the original, the modified text or the unified diff; download `.diff` or `.patch`; export statistics as JSON (`createDiffReport`). Copying and downloading happen locally.

### `<JsonDiffViewer>` and `<CsvDiffViewer>`

`JsonDiffViewer` takes `original`, `modified`, `ignorePaths`, `arrays`, `arrayKeys`, `sortKeys`, `jsonc`, `format`, `textOptions`, `view`/`defaultView`/`onViewChange` (`'tree' | 'text'`), `changesOnly`, `toolbar`, `theme`, `height`, `textViewProps` (passed to the inner `DiffViewer`, e.g. a highlighter) and `onResult`.

`CsvDiffViewer` takes `original`, `modified`, every `CsvDiffOptions` field (`header`, `delimiter`, `quote`, `keyColumns`, `rowOrder`, `ignoreColumns`, `ignoreCase`, `trimCells`), plus `changesOnly`, `toolbar`, `theme`, `height`, `rowHeight` and `onResult`.

### `<DiffStats>` and hooks

- `<DiffStats result={result} />` renders a compact "+12 −5" summary with a five-block bar, for file lists.
- `useDiff(original, modified, { options, differ, asyncThreshold })` returns `{ result, pending, error }`. Small inputs are compared during render, so SSR output is complete. Inputs over `asyncThreshold` (1 M characters) and custom `differ`s run asynchronously, and only the result for the latest inputs is committed.
- `useSyntaxTokens(lines, language, highlighter, fullLimit)` provides the tokens used by the viewer, for custom renderers.

## Headless engine (`m2diff-viewer/core`)

```ts
import { computeDiff, createUnifiedPatch, createDiffReport, diffJson, diffCsv, searchDiff, computeFolds } from 'm2diff-viewer/core';

const result = computeDiff(a, b, { ignoreWhitespace: 'trim' });
result.status; // 'identical' | 'equivalent' | 'added' | 'deleted' | 'modified'
result.rows; // aligned rows: { kind, old?: { number, text }, new?: …, oldRanges?, newRanges?, change, ignored? }
result.changes; // change blocks: { kind, oldStart, oldCount, newStart, newCount, rowStart, rowEnd }
result.stats; // { additions, deletions, changes, modifiedLines, unchangedLines, ignoredLines, … }
result.warnings; // truncated / timeout / intraline-skipped

createUnifiedPatch(result, { oldName: 'a/x.ts', newName: 'b/x.ts', context: 3 });
applyChange(result, 0, 'modified'); // modified text with change 0 copied over from the original
```

- **Algorithm.** The line comparison uses Myers' algorithm from the well-tested [`diff`](https://github.com/kpdecker/jsdiff) package, run on interned line ids. Common prefixes and suffixes are trimmed, and lines unique to one side are set aside first. Results are deterministic.
- **Alignment.** Inside a change block, removed and added lines are paired by similarity (an order-preserving optimal alignment over character-bigram similarity), then compared at word or character level.
- **Unicode.** Characters are never split. Character diffs work on code points, and ranges are UTF-16 offsets into the line text.
- **Patches.** A patch applies exactly (`git apply`, `patch`, jsdiff `applyPatch`) when you compare with `lineEndings: 'preserve'` and no ignore options. A fuzz test verifies this. With ignore options, context lines come from the original and ignored differences are not represented.
- **Other functions.** `searchDiff`, `computeFolds`/`buildDisplayItems`, `buildInlineItems`, `splitPieces` (merges syntax tokens with highlight ranges) and the language helpers are exported for custom renderers.

## Theming & customization

Every color and size is a CSS custom property on `.m2d-root`. Override any of them:

```css
.my-diff .m2d-root,
.m2d-root.my-diff {
  --m2d-font-mono: 'Berkeley Mono', monospace;
  --m2d-code-size: 12px; /* keep rowHeight in sync if you change line height */
  --m2d-add-bg: #e6ffec;
  --m2d-del-bg: #ffebe9;
  --m2d-mod-bg: #eef4ff;
  --m2d-accent: #7c3aed;
}
```

Main groups of variables:

- **Base:** `--m2d-bg`, `--m2d-fg`, `--m2d-muted`, `--m2d-border`, `--m2d-surface`, `--m2d-gutter-bg`, `--m2d-line-number`, `--m2d-accent`, `--m2d-focus`.
- **Changes:** `--m2d-add-bg/-gutter/-word/-fg/-mark` and the same set for `--m2d-del-*` and `--m2d-mod-*`; plus `--m2d-filler`, `--m2d-fold-bg`, `--m2d-match-bg`, `--m2d-match-active-bg`.
- **Syntax:** `--m2d-syn-keyword`, `-string`, `-number`, `-comment`, `-function`, `-type`, `-property`, `-meta`, `-tag`, `-attr`, `-variable`, `-punct`.
- **Layout:** `--m2d-font-ui`, `--m2d-font-mono`, `--m2d-ui-size`, `--m2d-code-size`, `--m2d-tab-size`, `--m2d-radius`.

Dark values are defined under `[data-theme='dark']` and under `prefers-color-scheme: dark` for `theme="auto"`. The shipped palettes are tested for at least 4.5:1 contrast for every syntax color on every change and highlight background (`tests/contrast.test.ts`). Rerun that test if you change them.

All classes are prefixed with `m2d-`, and `classNames` adds your own classes to the main slots. For a minimal, read-only embed: `toolbar={false} statusBar={false} overview={false} renderHeader={() => null}`.

## Large inputs & performance

Measured on an Apple M4 with Node 22 (method and full table in [docs/benchmarks.md](docs/benchmarks.md)):

| Comparison | Median |
| --- | ---: |
| 5,000 lines, 50 edits | 3.6 ms |
| 50,000 lines, 500 edits | 34 ms |
| 150,000 lines, 300 edits | 97 ms |
| 5,000 lines, every line rewritten | 144 ms |
| JSON, 10,000 objects (1.8 MB both sides) | 121–138 ms |
| CSV, 50,000 rows (5.2 MB both sides) | 77–143 ms |

These numbers measure the comparison only; in a browser they will vary by machine.

Safeguards (`options.limits`):

| Limit | Default | When exceeded |
| --- | --- | --- |
| `maxLines` | 200,000 per side | Further lines are left out; a `truncated` warning shows in the status bar |
| `maxChars` | 20,000,000 per side | Truncated at a line boundary |
| `timeoutMs` | 3,000 | The changed region is shown as one block (`timeout` warning). Correct, but not minimal. |
| `maxIntralineLength` | 2,000 | Longer lines (e.g. minified code) get whole-line highlighting |
| `maxAlignCells` | 40,000 | Bigger change blocks are paired in order instead of optimally |

Rendering:

- **Virtualization.** Rows have a fixed height, so a 100,000-line file keeps about 50 rows in the DOM. The panes use native scrolling with synchronized positions.
- **Highlighting.** Documents up to `highlightLimit` lines are highlighted as a whole, which is accurate for multi-line comments and strings. Above that, lines are highlighted as they scroll into view, and constructs that span lines may be colored approximately.
- **Comparison timing.** Inputs over 1 M characters are compared off the render path, so the previous result stays visible with a "Comparing…" status, and stale results are discarded. This still uses the main thread. For multi-megabyte inputs, move the work to a Web Worker:

```ts
// diff.worker.ts
import { handleDiffWorkerMessages } from 'm2diff-viewer/core';
handleDiffWorkerMessages(self);

// component
const differ = useMemo(() => createWorkerDiffer(() => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' })), []);
useEffect(() => () => differ.dispose(), [differ]);
<DiffViewer original={a} modified={b} differ={differ} />;
```

Aborting an in-flight worker comparison terminates the worker (real cancellation). Other pending comparisons are replayed on a fresh worker.

## Accessibility

Targets WCAG 2.2 AA:

- **Keyboard.** Every control is a native button, select or input with a visible focus ring.
  - The panes are focusable scroll regions.
  - The pane divider is a keyboard-operable `separator` (arrow keys, Home/End, Enter to reset).
  - Folds are buttons with `aria-expanded` and labels such as "Expand 42 unchanged lines (lines 10–51)".
  - Popovers close on Escape and return focus to their trigger.
- **Not color alone.** Gutter signs (`+`, `−`, `≈`) and screen-reader prefixes ("Added:", "Removed:", "Modified:") accompany the colors. Word highlights also carry an underline mark.
- **Announcements.** A polite live region reports navigation ("Difference 2 of 6: lines 12–15 changed"), search counts and copy/download results.
- **Contrast.** Text and syntax colors are tested at 4.5:1 or better on every background, in both themes. `forced-colors` mode adds outlines.
- **Motion.** Transitions are disabled under `prefers-reduced-motion`.
- **Copying.** Line numbers and signs are not part of the selected text.

The test suite runs axe-core against the split, inline, search, JSON and CSV views.

## Frameworks, SSR & browsers

- **React 18 and 19.** React is a peer dependency, never bundled. It's marked optional, so engine-only users don't install it.
- **Next.js (App Router).** Components carry `'use client'`. Pass plain string props from a Server Component, or render from your own client component when you need non-serializable props such as `highlighter` (see [examples/nextjs-client.tsx](examples/nextjs-client.tsx)). Import `m2diff-viewer/styles.css` once, for example in `app/layout.tsx`.
- **Server rendering.** Rendering on the server produces complete markup, including highlighting when the grammar is already loaded. No browser global is touched at import time; this is covered by tests run in a pure Node environment.
- **Other frameworks.** `m2diff-viewer/core` is framework-neutral. A Vue or Svelte view can be built on `computeDiff`, `computeFolds`, `buildInlineItems`, `searchDiff` and `splitPieces`, sharing `styles.css` class names. React components cannot be used directly in Vue; a native Vue adapter is on the roadmap.
- **Browsers.** The CSS targets Chrome/Edge 111+, Safari 16.4+ and Firefox 113+ (container queries, `:focus-visible`). The engine runs on ES2020 runtimes and Node 18+.
- **Module resolution.** Subpath exports (`/core`, `/highlight-js`, `/shiki`) need a resolver that understands `exports`: any modern bundler, or TypeScript with `moduleResolution` set to `bundler`, `node16` or `nodenext`.

## Troubleshooting

- **The viewer is unstyled.** Import `m2diff-viewer/styles.css` once in your app.
- **Nothing is highlighted.** Pass a `highlighter`, and check the language in the status bar. Unknown languages fall back to plain text by design. With highlight.js, grammars load asynchronously, so the first paint can be plain.
- **The toolbar view/whitespace/language controls are missing.** That prop is controlled without its change handler. Add `onViewChange`, `onOptionsChange` or `onLanguageChange`, or use the `default…` prop.
- **Rows overlap or are clipped after changing fonts.** Set `rowHeight` to your new line height in pixels.
- **"Simplified diff" warning.** The time budget ran out. Raise `options.limits.timeoutMs` or use a worker differ.
- **"Truncated" warning.** The input exceeds `limits.maxLines` or `limits.maxChars`.
- **The patch doesn't apply cleanly.** Compare with `lineEndings: 'preserve'` and without ignore options.
- **TypeScript cannot find `m2diff-viewer/core`.** Use `moduleResolution: "bundler"` or `"node16"`/`"nodenext"`.
- **Shiki types error with `Symbol.dispose`.** Add `"ESNext.Disposable"` to your `lib`. This comes from Shiki's own types.

## Use cases

- Code review and pull-request style file views; deployment and config change previews (`.env`, YAML, Dockerfiles).
- API response regression checks with volatile fields ignored (`ignorePaths: ['**.requestId', 'meta.timestamp']`).
- Data import previews: which rows a CSV upload will add, remove or change, matched by a key column.
- Document and content versioning in CMSs; prompt and template diffs; snapshot-test diff viewers.
- Server-side or CI use of the headless engine to produce unified patches and JSON change reports.

## Limitations & roadmap

These are not implemented in 0.1:

- **Multi-file comparison.** There is no file tree. Render one `DiffViewer` per file and use `DiffStats` for totals.
- **Line wrapping.** Long lines scroll horizontally; fixed row heights keep virtualization exact.
- **Partial fold expansion.** A fold expands in full, not N lines at a time.
- **Editing in the viewer.** The text is read-only. Whole changes can be copied across with the » « arrows (`onApplyChange`), but there is no free-form editing or three-way merge view.
- **Framework adapters.** There are no Vue or Svelte components yet; the core engine is ready for them.
- **Moved-block detection.** Moved code appears as a removal plus an addition.

## Development

Development needs Node 22 or newer (Vitest 5 and jsdom 30 require it). The published package doesn't: CI also installs the packed tarball on Node 20 and runs the smoke test there.

```bash
npm install
npm run dev          # demo with HMR (library consumed from source)
npm test             # engine, JSON/CSV, adapters, React, SSR, axe, contrast
npm run verify       # lint, format, typecheck, tests, build, publint + attw, size budgets, packed-tarball smoke test
npm run bench        # engine benchmarks (after `npm run build`)
npm run build:demo:dist  # demo built against dist/, exactly as an npm consumer would
npm run build:site   # prerendered landing page → site-dist/ (see below)
```

**Landing page.** The page at [m2toolkit.com/npm-packages/m2diff-viewer](https://www.m2toolkit.com/npm-packages/m2diff-viewer) is this repo's `demo/`, prerendered by `scripts/build-site.mjs` (shared verbatim with the other M2Toolkit packages). `site.config.json` holds the listing title, tagline, highlights and accent colour. M2Toolkit's `npm run sync:packages` runs `SITE_BASE=/npm-packages/m2diff-viewer/ npm run build:site` here and copies `site-dist/` into the site, so after changing the demo, `package.json` or `site.config.json`, re-sync from M2Toolkit. Keep one `<h1>`, a 15–65 character `<title>` and a 70–170 character meta description in `demo/index.html`.

See [docs/architecture.md](docs/architecture.md) for the design and its trade-offs, and [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT © Mohsin Zia
