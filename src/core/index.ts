/**
 * Public API of the framework-free core.
 * The VS Code adapter (`src/vscode-host`) consumes only this module.
 */

export type {
  BlankLine,
  BracketSpan,
  CueLine,
  DiagnosticFix,
  DocumentStats,
  Eol,
  FractionDigits,
  InstrumentalGap,
  LrcDiagnostic,
  LrcDocument,
  LrcLine,
  LineEnding,
  Severity,
  TagLine,
  TagToken,
  TextEdit,
  TimeStamp,
  TimestampSpan,
  Token,
  UnknownLine,
  WordTiming,
} from "./model";

export { allTags } from "./model";
export { analyze, resolveOffset } from "./analyzer";
export { shouldOfferSortAction } from "./policy";
export { parseDocument, rawLineText } from "./parser";
export { describeTag, inspectAt } from "./hover";
export type { HoverTarget } from "./hover";
export { COMMAND_IDS, isCommandId, runCommand } from "./commands";
export type { CommandId, CommandOptions, CommandOutcome } from "./commands";
export { sortCues } from "./services/sort";
export type { SortOptions } from "./services/sort";
export { shiftTimestamps } from "./services/shift";
export { applyOffsetTag, invertOffsetSign } from "./services/offset";
export type { InvertOffsetResult } from "./services/offset";
export { normalizePrecision, normalizeSpacing } from "./services/normalize";
export { expandMultiStampLines, stripWordTimings } from "./services/convert";
export { mergeBilingualPairs, splitBilingualLines } from "./services/bilingual";
export type { MergeBilingualResult, SplitBilingualResult } from "./services/bilingual";
export { parseSrt, formatSrt, srtCuesToLrc, lrcToSrtCues } from "./services/srt";
export type { SrtCue, ParseSrtResult } from "./services/srt";
export { computeStats, formatStatsReport, formatStatsSummary } from "./services/stats";
