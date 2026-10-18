// Verifies WCAG 2.2 contrast of the shipped colour tokens: every text colour that can appear on a
// diff row must reach 4.5:1 against every background it can sit on, in both themes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/styles/index.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--m2d-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const light = block('.m2d-root');
const dark = { ...light, ...block(".m2d-root[data-theme='dark']") };

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = [
  'fg',
  'syn-keyword',
  'syn-string',
  'syn-number',
  'syn-comment',
  'syn-function',
  'syn-type',
  'syn-property',
  'syn-meta',
  'syn-tag',
  'syn-attr',
  'syn-variable',
  'syn-punct',
];
const ROW_BG = ['bg', 'add-bg', 'del-bg', 'mod-bg', 'add-word', 'del-word', 'fold-bg', 'match-bg', 'match-active-bg'];

it('auto theme uses exactly the dark tokens under prefers-color-scheme: dark', () => {
  expect(block("  .m2d-root[data-theme='auto']")).toEqual(block(".m2d-root[data-theme='dark']"));
});

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (_name, t) => {
  it('code text is ≥ 4.5:1 on every row and highlight background', () => {
    const failures: string[] = [];
    for (const fg of TEXT)
      for (const bg of ROW_BG) if (contrast(t[fg], t[bg]) < 4.5) failures.push(`${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  it('line numbers, muted text and status colours are ≥ 4.5:1 on their surfaces', () => {
    const pairs: Array<[string, string]> = [
      ['line-number', 'gutter-bg'],
      ['add-fg', 'add-gutter'],
      ['del-fg', 'del-gutter'],
      ['mod-fg', 'mod-gutter'],
      ['muted', 'surface'],
      ['muted', 'fold-bg'],
      ['add-fg', 'surface'],
      ['del-fg', 'surface'],
      ['mod-fg', 'hunk-bg'],
      ['warn-fg', 'warn-bg'],
      ['accent', 'pressed'],
    ];
    const failures = pairs
      .filter(([f, b]) => contrast(t[f], t[b]) < 4.5)
      .map(([f, b]) => `${f} on ${b}: ${contrast(t[f], t[b]).toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  it('change backgrounds are distinguishable from the plain background (non-text 3:1 not required, but not identical)', () => {
    for (const bg of ['add-bg', 'del-bg', 'mod-bg']) expect(t[bg]).not.toBe(t.bg);
  });
});
