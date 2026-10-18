import { computeDiff } from './diff';
import type { DiffOptions, DiffResult } from './types';

/** An asynchronous comparison function, e.g. one backed by a Web Worker. */
export type Differ = (
  original: string | null | undefined,
  modified: string | null | undefined,
  options: DiffOptions | undefined,
  signal?: AbortSignal,
) => Promise<DiffResult>;

const abortError = () => {
  const e = new Error('The comparison was aborted.');
  e.name = 'AbortError';
  return e;
};

/** Yields to the event loop (lets the browser paint pending UI such as a "Comparing…" status). */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Runs `computeDiff` after yielding to the event loop. The comparison still runs on the calling
 * thread, so it is bounded by `limits.timeoutMs` rather than interruptible; aborting before it starts
 * skips it, and aborting while it runs discards its result. Use `createWorkerDiffer` to move the
 * work off the main thread entirely.
 */
export const computeDiffAsync: Differ = async (original, modified, options, signal) => {
  if (signal?.aborted) throw abortError();
  await yieldToEventLoop();
  if (signal?.aborted) throw abortError();
  const result = computeDiff(original, modified, options);
  if (signal?.aborted) throw abortError();
  return result;
};

/** The subset of the `Worker` interface the differ relies on (also satisfied by test doubles). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  terminate(): void;
}

interface Job {
  id: number;
  request: DiffWorkerRequest;
  resolve: (r: DiffResult) => void;
  reject: (e: unknown) => void;
}

export interface DiffWorkerRequest {
  type: 'm2diff:compute';
  id: number;
  original: string | null | undefined;
  modified: string | null | undefined;
  options: DiffOptions | undefined;
}

export type DiffWorkerResponse =
  { type: 'm2diff:result'; id: number; result: DiffResult } | { type: 'm2diff:error'; id: number; message: string };

export interface WorkerDiffer extends Differ {
  /** Terminates the worker and rejects pending comparisons. */
  dispose(): void;
}

/**
 * Creates a `Differ` that compares in a Web Worker. The worker is created lazily from `createWorker`.
 * Aborting an in-flight comparison terminates the worker (real cancellation) and transparently
 * re-submits other pending comparisons to a fresh one.
 *
 * ```ts
 * // diff.worker.ts
 * import { handleDiffWorkerMessages } from 'm2diff-viewer/core';
 * handleDiffWorkerMessages(self);
 *
 * // app
 * const differ = createWorkerDiffer(() => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }));
 * ```
 */
export function createWorkerDiffer(createWorker: () => WorkerLike): WorkerDiffer {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const pending = new Map<number, Job>();

  const spawn = (): WorkerLike => {
    const w = createWorker();
    w.addEventListener('message', (event: { data: unknown }) => {
      const msg = event.data as DiffWorkerResponse;
      const job = pending.get(msg?.id);
      if (!job || w !== worker) return;
      pending.delete(msg.id);
      if (msg.type === 'm2diff:result') job.resolve(msg.result);
      else job.reject(new Error(msg.message));
    });
    w.addEventListener('error', (event: unknown) => {
      if (w !== worker) return;
      const message = (event as { message?: string })?.message ?? 'Diff worker failed';
      for (const job of pending.values()) job.reject(new Error(message));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return w;
  };

  const differ = ((original, modified, options, signal) =>
    new Promise<DiffResult>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const id = nextId++;
      const request: DiffWorkerRequest = { type: 'm2diff:compute', id, original, modified, options };
      pending.set(id, { id, request, resolve, reject });
      worker ??= spawn();
      worker.postMessage(request);
      signal?.addEventListener(
        'abort',
        () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(abortError());
          // Kill the busy worker and replay the rest on a fresh one.
          worker?.terminate();
          worker = null;
          if (pending.size) {
            worker = spawn();
            for (const job of pending.values()) worker.postMessage(job.request);
          }
        },
        { once: true },
      );
    })) as WorkerDiffer;

  differ.dispose = () => {
    worker?.terminate();
    worker = null;
    for (const job of pending.values()) job.reject(abortError());
    pending.clear();
  };
  return differ;
}

/** Minimal worker global scope (`self` inside a worker). */
export interface WorkerScopeLike {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

/** Call inside a worker module to serve `createWorkerDiffer` requests. */
export function handleDiffWorkerMessages(scope: WorkerScopeLike): void {
  scope.addEventListener('message', (event) => {
    const msg = event.data as DiffWorkerRequest;
    if (!msg || msg.type !== 'm2diff:compute') return;
    let response: DiffWorkerResponse;
    try {
      response = { type: 'm2diff:result', id: msg.id, result: computeDiff(msg.original, msg.modified, msg.options) };
    } catch (e) {
      response = { type: 'm2diff:error', id: msg.id, message: e instanceof Error ? e.message : String(e) };
    }
    scope.postMessage(response);
  });
}
