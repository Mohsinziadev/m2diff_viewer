// Runs comparisons off the main thread. Bundle it with `new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' })`.
import { handleDiffWorkerMessages } from 'm2diff-viewer/core';

handleDiffWorkerMessages(self);
