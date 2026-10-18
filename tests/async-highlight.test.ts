import { describe, expect, it } from 'vitest';
import {
  computeDiffAsync,
  createWorkerDiffer,
  handleDiffWorkerMessages,
  languageFromFilename,
  resolveLanguage,
  splitPieces,
  tokenizeLines,
  type SyntaxHighlighter,
  type WorkerLike,
} from '../src/core';

describe('computeDiffAsync', () => {
  it('resolves with the same result as computeDiff', async () => {
    const r = await computeDiffAsync('a\n', 'b\n', undefined);
    expect(r.changes).toHaveLength(1);
  });

  it('rejects with AbortError when aborted', async () => {
    const ctrl = new AbortController();
    const p = computeDiffAsync('a', 'b', undefined, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

/** An in-process stand-in for a Web Worker that answers asynchronously, like the real thing. */
function fakeWorkerFactory() {
  const created: Array<{ terminated: boolean; received: number }> = [];
  const factory = (): WorkerLike => {
    const state = { terminated: false, received: 0 };
    created.push(state);
    const toMain: Array<(e: { data: unknown }) => void> = [];
    const toWorker: Array<(e: { data: unknown }) => void> = [];
    handleDiffWorkerMessages({
      addEventListener: (_t, l) => toWorker.push(l),
      postMessage: (msg) => setTimeout(() => !state.terminated && toMain.forEach((l) => l({ data: msg })), 5),
    });
    return {
      postMessage: (msg) => {
        state.received++;
        setTimeout(() => !state.terminated && toWorker.forEach((l) => l({ data: msg })), 0);
      },
      addEventListener: ((type: string, l: (e: { data: unknown }) => void) => {
        if (type === 'message') toMain.push(l);
      }) as WorkerLike['addEventListener'],
      terminate: () => {
        state.terminated = true;
      },
    };
  };
  return { factory, created };
}

describe('createWorkerDiffer', () => {
  it('computes in the worker and reuses it', async () => {
    const { factory, created } = fakeWorkerFactory();
    const differ = createWorkerDiffer(factory);
    const [a, b] = await Promise.all([differ('a\n', 'b\n', undefined), differ('x\n', 'x\n', undefined)]);
    expect(a.changes).toHaveLength(1);
    expect(b.status).toBe('identical');
    expect(created).toHaveLength(1);
  });

  it('cancels by terminating the worker and replays other pending jobs', async () => {
    const { factory, created } = fakeWorkerFactory();
    const differ = createWorkerDiffer(factory);
    const ctrl = new AbortController();
    const aborted = differ('a\n', 'b\n', undefined, ctrl.signal);
    const survivor = differ('c\n', 'd\n', undefined);
    ctrl.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect((await survivor).changes).toHaveLength(1);
    expect(created[0].terminated).toBe(true);
    expect(created).toHaveLength(2);
  });

  it('rejects pending jobs on dispose', async () => {
    const { factory } = fakeWorkerFactory();
    const differ = createWorkerDiffer(factory);
    const p = differ('a', 'b', undefined);
    differ.dispose();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('languages', () => {
  it('resolves aliases and file names', () => {
    expect(resolveLanguage('TS')).toBe('typescript');
    expect(resolveLanguage('yml')).toBe('yaml');
    expect(resolveLanguage('brainfuck')).toBe('brainfuck');
    expect(resolveLanguage(undefined)).toBe('plaintext');
    expect(languageFromFilename('src/App.tsx')).toBe('tsx');
    expect(languageFromFilename('.env.production')).toBe('dotenv');
    expect(languageFromFilename('Dockerfile')).toBe('dockerfile');
    expect(languageFromFilename('tsconfig.json')).toBe('jsonc');
    expect(languageFromFilename('README')).toBeUndefined();
  });
});

describe('highlighting helpers', () => {
  const fake: SyntaxHighlighter = {
    name: 'fake',
    resolve: (l) => (l === 'kw' ? 'kw' : null),
    isLoaded: () => true,
    load: async () => {},
    tokenize: (code) =>
      code.split('\n').map((line) =>
        line
          .split(/(\s+)/)
          .filter(Boolean)
          .map((text) => ({ text, className: text === 'let' ? 'hljs-keyword' : undefined })),
      ),
  };

  it('tokenizes lines and falls back to plain text for unknown languages', () => {
    const t = tokenizeLines(fake, ['let x', 'y'], 'kw')!;
    expect(t[0]!.map((x) => x.text)).toEqual(['let', ' ', 'x']);
    expect(tokenizeLines(fake, ['a'], 'other')).toBeNull();
    expect(tokenizeLines(null, ['a'], 'kw')).toBeNull();
  });

  it('drops tokens that do not reproduce the line text', () => {
    const broken: SyntaxHighlighter = { ...fake, tokenize: () => [[{ text: 'wrong' }]] };
    expect(tokenizeLines(broken, ['right'], 'kw')).toEqual([undefined]);
    const throwing: SyntaxHighlighter = {
      ...fake,
      tokenize: () => {
        throw new Error('boom');
      },
    };
    expect(tokenizeLines(throwing, ['x'], 'kw')).toBeNull();
  });

  it('splits pieces at token and decoration boundaries without altering text', () => {
    const tokens = [{ text: 'let', className: 'k' }, { text: ' ' }, { text: 'value' }];
    const pieces = splitPieces('let value', tokens, [{ start: 2, end: 6, className: 'chg' }]);
    expect(pieces.map((p) => [p.text, p.token?.className ?? '', p.decorations])).toEqual([
      ['le', 'k', ''],
      ['t', 'k', 'chg'],
      [' ', '', 'chg'],
      ['va', '', 'chg'],
      ['lue', '', ''],
    ]);
    expect(pieces.map((p) => p.text).join('')).toBe('let value');
    expect(splitPieces('', undefined)).toEqual([]);
    expect(splitPieces('abc', undefined, [{ start: 1, end: 2, className: 'm' }]).map((p) => p.decorations)).toEqual(['', 'm', '']);
  });
});
