// Benchmarks the comparison engine from the built package (run `npm run build` first).
// Inputs are generated deterministically; each case is warmed up, then timed several times and the
// median is reported. Pass --write to update docs/benchmarks.md with the results.
import { writeFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { computeDiff, createUnifiedPatch, diffCsv, diffJson } from '../dist/core/index.js';

const root = resolve(import.meta.dirname, '..');

let seed = 1;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function codeFile(lines) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    const indent = '  '.repeat(i % 4);
    out.push(i % 40 === 0 ? `// section ${i / 40}` : `${indent}const value${i} = compute(${i}, "${(i * 7919) % 1000}"); // note ${i % 97}`);
  }
  return out;
}

/** Applies `edits` scattered edits: a third modify a line, a third insert, a third delete. */
function edit(lines, edits) {
  const out = [...lines];
  for (let e = 0; e < edits; e++) {
    const at = Math.floor(rand() * out.length);
    const op = e % 3;
    if (op === 0) out[at] = out[at].replace('compute', 'calculate');
    else if (op === 1) out.splice(at, 0, `  const inserted${e} = ${e};`);
    else out.splice(at, 1);
  }
  return out;
}

const join = (l) => l.join('\n') + '\n';

const cases = [];
for (const [name, lines, edits] of [
  ['small', 100, 5],
  ['medium', 5_000, 50],
  ['large', 50_000, 500],
  ['very large', 150_000, 300],
]) {
  seed = lines;
  const base = codeFile(lines);
  const a = join(base);
  const b = join(edit(base, edits));
  cases.push({
    name: `text ${name}: ${lines.toLocaleString('en-US')} lines, ${edits} edits`,
    run: () => computeDiff(a, b),
    size: a.length + b.length,
  });
}
{
  seed = 7;
  const base = codeFile(5_000);
  const a = join(base);
  const b = join(base.map((l) => l.replace(/value(\d+)/, (_, n) => `item${(Number(n) * 31) % 5000}`)));
  cases.push({ name: 'text worst case: 5,000 lines, every line changed', run: () => computeDiff(a, b), size: a.length + b.length });
}
{
  seed = 11;
  const base = codeFile(50_000);
  const a = join(base);
  const b = join(edit(base, 500));
  cases.push({ name: 'unified patch for the large case', run: () => createUnifiedPatch(computeDiff(a, b)), size: a.length + b.length });
  cases.push({
    name: 'text large, ignore all whitespace + char intraline',
    run: () => computeDiff(a, b, { ignoreWhitespace: 'all', intraline: 'char' }),
    size: a.length + b.length,
  });
}
{
  const records = Array.from({ length: 10_000 }, (_, i) => ({
    id: i,
    name: `user ${i}`,
    tags: ['a', 'b', String(i % 7)],
    meta: { score: i % 100, updatedAt: `2025-01-${(i % 28) + 1}` },
  }));
  const changed = records
    .map((r) => (r.id % 50 === 0 ? { ...r, meta: { ...r.meta, score: r.meta.score + 1 } } : r))
    .filter((r) => r.id % 333 !== 0);
  const a = JSON.stringify(records);
  const b = JSON.stringify(changed);
  cases.push({
    name: 'JSON: 10,000 objects (~0.9 MB), keyed by id, 1 ignored path',
    run: () => diffJson(a, b, { arrayKeys: { $: 'id' }, ignorePaths: ['[*].meta.updatedAt'] }),
    size: a.length + b.length,
  });
  cases.push({ name: 'JSON: same, ordered arrays', run: () => diffJson(a, b), size: a.length + b.length });
}
{
  const head = 'id,name,email,score,city\n';
  const rows = Array.from({ length: 50_000 }, (_, i) => `${i},"Name ${i}",user${i}@example.com,${i % 100},"City, ${i % 50}"`);
  const a = head + rows.join('\n') + '\n';
  const b =
    head +
    rows
      .map((r, i) => (i % 97 === 0 ? r.replace(/,(\d+),"City/, (_, s) => `,${Number(s) + 1},"City`) : r))
      .filter((_, i) => i % 1000 !== 5)
      .join('\n') +
    '\n';
  cases.push({ name: 'CSV: 50,000 rows (~2.8 MB), ordered', run: () => diffCsv(a, b), size: a.length + b.length });
  cases.push({ name: 'CSV: 50,000 rows, keyed by id', run: () => diffCsv(a, b, { keyColumns: ['id'] }), size: a.length + b.length });
}

const median = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
const results = [];
for (const c of cases) {
  c.run(); // warm-up
  const runs = c.name.includes('very large') || c.name.includes('worst') ? 3 : 7;
  const times = [];
  let last;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    last = c.run();
    times.push(performance.now() - t);
  }
  const detail =
    last?.stats?.changes !== undefined
      ? `${last.stats.changes} changes`
      : last?.structure
        ? `${last.structure.changes.length} changes`
        : last?.stats
          ? `${last.stats.added + last.stats.removed + last.stats.modified} row changes`
          : typeof last === 'string'
            ? `${last.length.toLocaleString('en-US')} chars`
            : '';
  const warn = last?.warnings?.length ? ` (${last.warnings.map((w) => w.code ?? w).join(', ')})` : '';
  results.push({ name: c.name, ms: median(times), size: c.size, detail: detail + warn, runs });
  console.log(`${c.name.padEnd(62)} ${median(times).toFixed(1).padStart(8)} ms  ${detail}${warn}`);
}

if (process.argv.includes('--write')) {
  const cpu = cpus()[0]?.model ?? 'unknown CPU';
  const md = `# Benchmarks

Measured with \`npm run bench\` (\`benchmarks/run.mjs\`) against the built package.

- Machine: ${cpu}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB RAM, ${platform()} ${release()}
- Runtime: Node.js ${process.version}
- Method: deterministic generated inputs; one warm-up run, then the median of ${results[0].runs} runs (3 for the slowest cases). Times are for the comparison only — no rendering.

| Case | Input (both sides) | Median | Result |
| --- | ---: | ---: | --- |
${results.map((r) => `| ${r.name} | ${(r.size / 1024 / 1024).toFixed(2)} MB | ${r.ms < 10 ? r.ms.toFixed(2) : r.ms.toFixed(0)} ms | ${r.detail} |`).join('\n')}

## Notes

- Line comparison is Myers' O(ND) algorithm (via \`diff\`), run on interned line ids after trimming the
  common prefix and suffix and setting aside lines that exist on only one side (they can never match),
  so cost grows with the number of *differences* among shared lines, not with file size.
- The "worst case" rewrites every line except periodic section comments. Inputs whose differences are
  dominated by *repeated* lines (e.g. many \`}\` or blank lines in a rewritten file) are the remaining slow
  case; the default 3 s time budget (\`limits.timeoutMs\`) bounds them: when exceeded, the changed region is
  reported as one replacement block with a \`timeout\` warning.
- Word/character highlighting runs only for paired (edited) lines and shares the same time budget.
- Rendering cost is independent of file size: the viewer virtualises rows (only visible rows are in the
  DOM) and highlights only visible lines for documents above \`highlightLimit\` (10 000 lines by default).
- Your numbers will differ by machine and browser; run \`npm run build && npm run bench\` to reproduce.
`;
  await writeFile(resolve(root, 'docs/benchmarks.md'), md);
  console.log('\nwrote docs/benchmarks.md');
}
