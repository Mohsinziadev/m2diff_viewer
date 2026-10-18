'use client';
import { useEffect, useMemo, useState } from 'react';
import { computeDiff } from '../core/diff';
import { computeDiffAsync, type Differ } from '../core/async';
import type { DiffOptions, DiffResult } from '../core/types';

export interface UseDiffOptions {
  /** Comparison options (memoise the object, or pass stable values, to avoid recomputation). */
  options?: DiffOptions;
  /** Compute asynchronously with this function, e.g. `createWorkerDiffer(...)`. */
  differ?: Differ;
  /**
   * Combined input length (characters) above which the comparison is deferred off the render path
   * (the previous result stays visible meanwhile). Default 1 000 000. Ignored when `differ` is set.
   */
  asyncThreshold?: number;
}

export interface UseDiffState {
  /** Latest result for the current inputs; while recomputing, the previous result (see `pending`). */
  result: DiffResult | null;
  /** A newer comparison is running. */
  pending: boolean;
  error: Error | null;
  /** Wall-clock milliseconds the latest committed comparison took (`null` before the first one). */
  duration: number | null;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const optionsKey = (o: DiffOptions | undefined) =>
  o ? JSON.stringify([o.ignoreWhitespace, o.ignoreCase, o.lineEndings, o.intraline, o.limits ?? null]) : '';

/**
 * Compares two texts in React. Small inputs are compared synchronously during render (so SSR output is
 * complete); large inputs and custom `differ`s run asynchronously with stale-result protection: only the
 * comparison for the latest inputs is ever committed, and superseded runs are aborted.
 */
export function useDiff(
  original: string | null | undefined,
  modified: string | null | undefined,
  config: UseDiffOptions = {},
): UseDiffState {
  const { options, differ, asyncThreshold = 1_000_000 } = config;
  const key = optionsKey(options);
  const compareKeys = options?.compareKeys;
  const size = (original?.length ?? 0) + (modified?.length ?? 0);
  const isAsync = !!differ || size > asyncThreshold;

  const sync = useMemo<UseDiffState | null>(() => {
    if (isAsync) return null;
    const start = now();
    try {
      const result = computeDiff(original, modified, options);
      return { result, pending: false, error: null, duration: now() - start };
    } catch (e) {
      return { result: null, pending: false, error: e instanceof Error ? e : new Error(String(e)), duration: null };
    }
    // `options` is tracked through its serialised key and compareKeys identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAsync, original, modified, key, compareKeys]);

  // Identity of the current async request; a committed result is "pending" until it answers this one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo(() => ({}), [isAsync, differ, original, modified, key, compareKeys]);
  const [asyncState, setAsyncState] = useState<{
    result: DiffResult | null;
    error: Error | null;
    duration: number | null;
    for: object | null;
  }>({ result: null, error: null, duration: null, for: null });

  useEffect(() => {
    if (!isAsync) return;
    const ctrl = new AbortController();
    const start = now();
    (differ ?? computeDiffAsync)(original, modified, options, ctrl.signal).then(
      (result) => {
        if (!ctrl.signal.aborted) setAsyncState({ result, error: null, duration: now() - start, for: request });
      },
      (error: unknown) => {
        if (ctrl.signal.aborted || (error as Error)?.name === 'AbortError') return;
        setAsyncState((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)), for: request }));
      },
    );
    return () => ctrl.abort();
    // `request` changes exactly when any input does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return sync ?? { result: asyncState.result, error: asyncState.error, duration: asyncState.duration, pending: asyncState.for !== request };
}
