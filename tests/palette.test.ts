import { describe, expect, it } from 'vitest';
import { filterCommands, fuzzyMatch, type PaletteCommand } from '../src/react/palette';

const cmd = (group: string, title: string, extra: Partial<PaletteCommand> = {}): PaletteCommand => ({
  id: `${group}.${title}`,
  group,
  title,
  run: () => {},
  ...extra,
});

describe('fuzzyMatch', () => {
  it('matches subsequences and reports positions', () => {
    expect(fuzzyMatch('nd', 'Next difference')?.indices).toEqual([0, 5]);
    expect(fuzzyMatch('xyz', 'Next difference')).toBeNull();
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('prefers word starts and consecutive characters', () => {
    expect(fuzzyMatch('nd', 'Go: Next difference')!.indices).toEqual([4, 9]);
    expect(fuzzyMatch('next', 'Settings: nice extra text')!.score).toBeLessThan(fuzzyMatch('next', 'Go: Next difference')!.score);
  });
});

describe('filterCommands', () => {
  const cmds = [
    cmd('View', 'Inline'),
    cmd('Go', 'Next difference'),
    cmd('Language', 'Python', { searchOnly: true }),
    cmd('Export', 'Copy link', { keywords: 'url permalink' }),
  ];

  it('lists only regular commands for an empty query', () => {
    expect(filterCommands(cmds, '').map((c) => c.title)).toEqual(['Inline', 'Next difference', 'Copy link']);
  });

  it('ranks matches, includes search-only items and falls back to keywords', () => {
    expect(filterCommands(cmds, 'next')[0].title).toBe('Next difference');
    expect(filterCommands(cmds, 'pyth').map((c) => c.title)).toEqual(['Python']);
    expect(filterCommands(cmds, 'permalink').map((c) => c.title)).toEqual(['Copy link']);
  });
});
