// React UI. Components are client components ('use client'); the core re-exports are server-safe.
export { DiffViewer, DEFAULT_KEY_BINDINGS } from './DiffViewer';
export type {
  DiffViewerProps,
  DiffViewerHandle,
  DiffViewerSlot,
  ToolbarOptions,
  ViewMode,
  ViewModeSetting,
  ThemeSetting,
  KeyBindings,
  DiffAction,
  ExportAction,
  ExportEvent,
  NavigateEvent,
  ApplyChangeEvent,
} from './DiffViewer';
export { JsonDiffViewer } from './JsonDiffViewer';
export type { JsonDiffViewerProps, StructuredView } from './JsonDiffViewer';
export { CsvDiffViewer } from './CsvDiffViewer';
export type { CsvDiffViewerProps } from './CsvDiffViewer';
export { DiffStats } from './DiffStats';
export type { DiffStatsProps } from './DiffStats';
export { useDiff } from './useDiff';
export type { UseDiffOptions, UseDiffState } from './useDiff';
export { useSyntaxTokens } from './useSyntaxTokens';
export type { TokenSource, HighlightStatus } from './useSyntaxTokens';

export * from '../core/index';
