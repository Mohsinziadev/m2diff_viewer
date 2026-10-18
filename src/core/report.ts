import { describeEol } from './text';
import type { ChangeKind, DiffResult, DiffStats, DiffStatus, DiffWarning, ResolvedDiffOptions } from './types';

/** A JSON-serialisable summary of a comparison, for exports, CI annotations or analytics. */
export interface DiffReport {
  format: 'm2diff-report';
  version: 1;
  status: DiffStatus;
  stats: DiffStats;
  changes: Array<{ index: number; kind: ChangeKind; oldStart: number; oldCount: number; newStart: number; newCount: number }>;
  lineEndings: { original: string; modified: string };
  options: Omit<ResolvedDiffOptions, 'limits'>;
  warnings: DiffWarning[];
  labels?: { original?: string; modified?: string };
}

export function createDiffReport(result: DiffResult, labels?: { original?: string; modified?: string }): DiffReport {
  const { limits: _limits, ...options } = result.options;
  return {
    format: 'm2diff-report',
    version: 1,
    status: result.status,
    stats: { ...result.stats },
    changes: result.changes.map(({ index, kind, oldStart, oldCount, newStart, newCount }) => ({
      index,
      kind,
      oldStart,
      oldCount,
      newStart,
      newCount,
    })),
    lineEndings: { original: describeEol(result.original.eol), modified: describeEol(result.modified.eol) },
    options,
    warnings: result.warnings.map((w) => ({ ...w })),
    ...(labels ? { labels } : {}),
  };
}
