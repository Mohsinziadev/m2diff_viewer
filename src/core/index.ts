// Framework-independent comparison engine: no React, no DOM access, safe on servers and in workers.
export { computeDiff, resolveOptions, DEFAULT_LIMITS } from './diff';
export { computeDiffAsync, createWorkerDiffer, handleDiffWorkerMessages } from './async';
export type { Differ, WorkerLike, WorkerScopeLike, WorkerDiffer, DiffWorkerRequest, DiffWorkerResponse } from './async';
export { intralineRanges, mergeRanges } from './intraline';
export { similarity, profile } from './align';
export { splitLines, normalizeLine, visualLength, describeEol, detectIndent, describeIndent } from './text';
export type { IndentStyle } from './text';
export { computeFolds, buildDisplayItems, foldContaining } from './fold';
export type { FoldRegion, FoldOptions, DisplayItem } from './fold';
export { buildInlineItems } from './inline';
export type { InlineItem } from './inline';
export { applyChange } from './merge';
export { createUnifiedPatch } from './patch';
export type { PatchOptions } from './patch';
export { searchDiff } from './search';
export type { SearchOptions, SearchMatch, SearchResult, SearchScope } from './search';
export { createDiffReport } from './report';
export type { DiffReport } from './report';
export { tokenizeLines, tokenizeWithGrammar, splitPieces, FONT_BOLD, FONT_ITALIC, FONT_UNDERLINE } from './highlight';
export type { SyntaxHighlighter, SyntaxToken, TokenLine, Decoration, Piece } from './highlight';
export { LANGUAGES, resolveLanguage, getLanguageInfo, languageLabel, languageFromFilename } from './languages';
export type { LanguageInfo } from './languages';

export { parseJson } from './json/parse';
export type { ParseError, ParseResult, JsonParseOptions } from './json/parse';
export { formatJsonPath, parsePathPattern, matchesPath, createPathMatcher } from './json/path';
export type { JsonPath, PathPattern, PathMatcher } from './json/path';
export { diffValues, valueType, formatJsonLines } from './json/diff';
export type {
  ValueDiffNode,
  ValueChange,
  ValueChangeKind,
  ValueDiffOptions,
  ValueDiffResult,
  ValueDiffStats,
  ValueType,
  NodeStatus,
  FormattedLines,
} from './json/diff';
export { diffStructured, diffJson, jsonFormat, jsoncFormat, envFormat } from './structured';
export type { StructuredFormat, StructuredDiffOptions, StructuredDiffResult, JsonDiffOptions } from './structured';

export { parseCsv, detectDelimiter } from './csv/parse';
export type { CsvParseOptions, CsvParseResult, CsvParseError, CsvErrorCode } from './csv/parse';
export { diffCsv } from './csv/diff';
export type { CsvDiffOptions, CsvDiffResult, CsvColumn, CsvCell, CsvRowDiff, CsvDiffStats, ColumnRef } from './csv/diff';

export type * from './types';
