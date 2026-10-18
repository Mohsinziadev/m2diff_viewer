import type { DiffResult, DiffStats as Stats } from '../core/types';
import { cx } from './utils';

export interface DiffStatsProps {
  /** A comparison result, or its `stats`. */
  result?: DiffResult;
  stats?: Pick<Stats, 'additions' | 'deletions'>;
  /** Show the five-block proportion bar (like a pull-request file list). Default true. */
  bar?: boolean;
  className?: string;
}

/** Compact "+12 −5" summary with an optional proportion bar, e.g. for file lists. */
export function DiffStats({ result, stats, bar = true, className }: DiffStatsProps) {
  const s = stats ?? result?.stats;
  if (!s) return null;
  const { additions, deletions } = s;
  const total = additions + deletions;
  const blocks = 5;
  const green = total ? Math.round((additions / total) * blocks) : 0;
  const red = total ? Math.min(blocks - green, Math.round((deletions / total) * blocks)) : 0;
  return (
    <span
      className={cx('m2d-diffstats', className)}
      aria-label={`${additions} ${additions === 1 ? 'addition' : 'additions'} and ${deletions} ${deletions === 1 ? 'deletion' : 'deletions'}`}
      role="img"
    >
      <span className="m2d-stat-add" aria-hidden="true">
        {`+${additions.toLocaleString('en-US')}`}
      </span>
      <span className="m2d-stat-del" aria-hidden="true">
        {`−${deletions.toLocaleString('en-US')}`}
      </span>
      {bar && (
        <span className="m2d-bar" aria-hidden="true">
          {Array.from({ length: blocks }, (_, i) => (
            <span key={i} className={i < green ? 'm2d-bar-add' : i < green + red ? 'm2d-bar-del' : 'm2d-bar-none'} />
          ))}
        </span>
      )}
    </span>
  );
}
