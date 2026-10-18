# Benchmarks

Measured with `npm run bench` (`benchmarks/run.mjs`) against the built package.

- Machine: Apple M4, 10 cores, 16 GB RAM, darwin 25.5.0
- Runtime: Node.js v22.23.1
- Method: deterministic generated inputs; one warm-up run, then the median of 7 runs (3 for the slowest cases). Times are for the comparison only — no rendering.

| Case | Input (both sides) | Median | Result |
| --- | ---: | ---: | --- |
| text small: 100 lines, 5 edits | 0.01 MB | 0.12 ms | 5 changes |
| text medium: 5,000 lines, 50 edits | 0.50 MB | 3.31 ms | 49 changes |
| text large: 50,000 lines, 500 edits | 5.19 MB | 30 ms | 493 changes |
| text very large: 150,000 lines, 300 edits | 15.84 MB | 96 ms | 297 changes |
| text worst case: 5,000 lines, every line changed | 0.50 MB | 136 ms | 125 changes |
| unified patch for the large case | 5.19 MB | 31 ms | 202,915 chars |
| text large, ignore all whitespace + char intraline | 5.19 MB | 75 ms | 492 changes |
| JSON: 10,000 objects (~0.9 MB), keyed by id, 1 ignored path | 1.84 MB | 121 ms | 230 changes |
| JSON: same, ordered arrays | 1.84 MB | 119 ms | 234 changes |
| CSV: 50,000 rows (~2.8 MB), ordered | 5.15 MB | 113 ms | 565 row changes |
| CSV: 50,000 rows, keyed by id | 5.15 MB | 54 ms | 565 row changes |

## Notes

- Line comparison is Myers' O(ND) algorithm (via `diff`), run on interned line ids after trimming the
  common prefix and suffix and setting aside lines that exist on only one side (they can never match),
  so cost grows with the number of *differences* among shared lines, not with file size.
- The "worst case" rewrites every line except periodic section comments. Inputs whose differences are
  dominated by *repeated* lines (e.g. many `}` or blank lines in a rewritten file) are the remaining slow
  case; the default 3 s time budget (`limits.timeoutMs`) bounds them: when exceeded, the changed region is
  reported as one replacement block with a `timeout` warning.
- Word/character highlighting runs only for paired (edited) lines and shares the same time budget.
- Rendering cost is independent of file size: the viewer virtualises rows (only visible rows are in the
  DOM) and highlights only visible lines for documents above `highlightLimit` (10 000 lines by default).
- Your numbers will differ by machine and browser; run `npm run build && npm run bench` to reproduce.
