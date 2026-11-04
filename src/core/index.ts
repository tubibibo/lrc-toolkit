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
  FractionDigits,
  InstrumentalGap,
  LrcDiagnostic,
  LrcDocument,
  LrcLine,
  Severity,
  TagLine,
  TextEdit,
  TimeStamp,
  TimestampSpan,
  Token,
  UnknownLine,
  WordTiming,
} from "./model";

export { analyze, resolveOffset } from "./analyzer";
export { parseDocument, rawLineText } from "./parser";
export { describeTag, inspectAt } from "./hover";
export type { HoverTarget } from "./hover";
export { COMMAND_IDS, isCommandId, runCommand } from "./commands";
export type { CommandId, CommandOptions, CommandOutcome } from "./commands";
export { sortCues } from "./services/sort";
export { shiftTimestamps } from "./services/shift";
export { applyOffsetTag } from "./services/offset";
export { normalizePrecision, normalizeSpacing } from "./services/normalize";
export { expandMultiStampLines, stripWordTimings } from "./services/convert";
export { computeStats, formatStatsReport } from "./services/stats";
