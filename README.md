# LRC Toolkit

[![CI](https://github.com/tubibibo/lrc-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/tubibibo/lrc-toolkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A lightweight toolkit for editing LRC (synced lyrics) files in VS Code.**

`.lrc` is the de-facto format for line-synced lyrics in music players (foobar2000, Poweramp,
NetEase Cloud Music, foobar/mobile karaoke tools…), yet editor support for it is fragmented:
the marketplace offers a single-purpose offset adjuster, an XLRC custom editor and a handful of
"now playing" viewers — but as of late 2026, no comprehensive LRC editing toolkit was found on
the Marketplace. LRC Toolkit fills that gap with a zero-dependency, well-tested extension.
See [docs/research.md](docs/research.md) for the survey.

> 简体中文简介见文末 [中文简介](#中文简介)。

---

## Features

| Feature | Details |
| --- | --- |
| Syntax highlighting | Timestamps, metadata tags and enhanced (word-level) timings; malformed brackets are flagged inline |
| Live diagnostics | 13 stable diagnostic codes for broken timelines, malformed timestamps/tags, bad word timings, offset problems, wrong file encodings (see below) |
| Timestamp hover | Absolute time, effective time under `[offset:]`, delta to the previous line and instrumental-gap detection |
| Tag hover | Explains every standard metadata tag |
| Document outline | Metadata tags and every cue line appear in the symbol outline |
| Code actions | Quick fixes from diagnostics + source actions (sort, strip word timings, apply offset) |
| SRT / VTT import, SRT export | SubRip / WebVTT subtitles → LRC, and LRC → SRT — fidelity scope is the timeline plus plain text |
| Document formatter | Normalizes spacing between timestamps and text, trims trailing whitespace |

### Commands

| Command | Description |
| --- | --- |
| `LRC: Sort Lines by Timestamp` | Stable-sorts cue lines; tags stay on top; ties keep their order. Unrecognized lines and interior blank lines are removed — the result message reports how many |
| `LRC: Shift All Timestamps…` | Shifts every timestamp by ±N ms (clamps at 00:00.00) |
| `LRC: Apply [offset:] Tag into Timestamps` | Bakes the offset into raw timestamps and removes the tag |
| `LRC: Invert [offset:] Sign` | Flips the sign of the first valid `[offset:]` tag (timestamps untouched) — for players that read the direction the other way |
| `LRC: Normalize Timestamp Precision…` | Rewrites every timestamp to 2-digit (centiseconds) or 3-digit (milliseconds) precision |
| `LRC: Strip Enhanced (Word-Level) Timings` | Converts enhanced LRC back to plain LRC |
| `LRC: Expand Multi-Timestamp Lines` | `[00:01][00:02] text` → one line per timestamp |
| `LRC: Merge Bilingual Lines (original\|translation)` | Two adjacent cue lines sharing one timestamp → one `original\|translation` line (timestamp from the first line) |
| `LRC: Split Bilingual Lines at '\|'` | Merged bilingual lines → two timestamped lines, split at the first unescaped `\|` |
| `LRC: Import Subtitles (SRT/VTT)…` | Reads an `.srt`/`.vtt` file and opens the converted lyrics as a new untitled `.lrc` document |
| `LRC: Export as SRT…` | Writes the active `.lrc` document as SRT (asks before overwriting) |
| `LRC: Show Document Statistics` | Cue count, duration, instrumental gaps, duplicates (in the `LRC Toolkit` output channel) |

SRT / VTT conversion keeps the **timeline and the plain text** — nothing else. Import strips
inline markup (`<i>…</i>` and friends), joins a block's multi-line text into one lyric line and
drops `STYLE` / `NOTE` sections (the result message reports how many); both the SRT
`HH:MM:SS,mmm` form and WebVTT's `.` separator with optional hours are accepted. Export writes
one SRT block per lyric line using each line's first timestamp with the `[offset:]` baked in
(an SRT has no offset mechanism), recomputes end times from the next line's start, and never
overwrites an existing file silently.

Standalone section labels such as `[Chorus]` and `[Verse]` are unrecognized
lines, not metadata tags or timed cues. **Sort Lines by Timestamp removes
them** and reports the number of dropped lines; it does not move section
labels with a lyric block. Keep a copy before sorting lyrics that use these
labels, or use Undo to restore them. To keep the labels instead, enable
`lrcToolkit.sort.keepSectionLabels`: each label then travels with the first
cue line that follows it and is re-sorted together with that cue. A
timestamped label such as `[00:12.00][Chorus]` is cue text and remains with
its timestamp.

### Diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `invalid-timestamp` | error | Bracket looks like a timestamp but is malformed (e.g. `[01:60]`) |
| `invalid-offset` | error | `[offset:]` value is not an integer number of milliseconds |
| `unrecognized-token` | warning | Leading bracket is neither a timestamp nor a tag |
| `stray-line` | warning | Line is neither a cue nor a tag |
| `decreasing-timestamp` | warning | The lyric timeline goes backwards |
| `duplicate-offset` | warning | More than one `[offset:]` tag |
| `word-timing-before-cue` | warning | Word timing starts before its line's timestamp |
| `word-timing-disorder` | warning | Word timings do not ascend |
| `invalid-word-timing` | warning | `<...>` token looks like a word timing but is malformed |
| `duplicate-timestamp` | info | A line starts exactly where the previous one does |
| `empty-cue-text` | info | Timestamp without lyric text (fine for instrumentals) |
| `empty-tag-value` | info | A content tag (`ti`, `ar`, …) carries no value |
| `suspected-encoding` | info | 3+ replacement characters (U+FFFD) — the file was likely read in the wrong encoding |

The common bilingual convention of two consecutive lines sharing one timestamp is supported:
sorting keeps each pair together, and the analyzer emits at most one informational hint per
document for these shared start times. `Merge Bilingual Lines` / `Split Bilingual Lines`
implement the matching `original|translation` convention as explicit commands, and statistics
treat such pairs as expected rather than counting them as duplicate timestamps. A timestamp
with seconds above 59 (e.g. `[01:75.00]`) offers two quick fixes: carry the excess seconds
into the minutes, or clamp them to 59 — unless carrying would overflow the four-digit minute
budget, in which case only the clamp is offered.

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| `lrcToolkit.gapThresholdSeconds` | `8` | Gaps longer than this are flagged as instrumental (hover & statistics) |
| `lrcToolkit.format.spaceAfterTimestamp` | `false` | Formatter emits exactly one space between timestamp and text |
| `lrcToolkit.sort.keepSectionLabels` | `false` | Sorting keeps standalone section labels, each glued to the first cue line that follows it |

### The `[offset:]` convention

Per the [LRC format description](https://en.wikipedia.org/wiki/LRC_(file_format)), a **positive**
`[offset:]` makes lyrics display **earlier**: `display time = timestamp − offset`. LRC Toolkit
follows this convention everywhere (hovers, statistics, and the *Apply offset* command).
Note that some players interpret the sign the other way — [ADR 0004](docs/adr/0004-offset-sign-convention.md)
documents the decision and the caveats. When in doubt, use *Shift All Timestamps* which shifts
raw values explicitly, or *Invert [offset:] Sign* to flip an existing tag without touching the
timestamps.

## Installation

- From source: `npm ci && npm run compile && npm run package`, then install the produced
  `lrc-toolkit-<version>.vsix` via `Extensions → Install from VSIX…`.
- Requires VS Code `1.85` or newer.

## Development

```bash
npm ci            # install dev dependencies
npm run verify    # typecheck → lint → layering → format → tests → bundle → smoke → package
npm run watch     # esbuild watch mode
```

Press **F5** in this repository to launch an Extension Development Host with the extension loaded.

### Architecture

The codebase is split into a framework-free core and a thin VS Code adapter
([design notes](docs/design.md), [ADR 0002](docs/adr/0002-framework-free-core.md)):

```
src/
├── core/            # pure TypeScript domain layer — no vscode import (ESLint-enforced)
│   ├── model.ts     # document model, plain-data diagnostics & text edits
│   ├── parser.ts    # text → LrcDocument
│   ├── analyzer.ts  # LrcDocument → diagnostics
│   ├── hover.ts     # structured hover targets
│   ├── commands.ts  # user-facing operations as pure functions
│   ├── services/    # sort / shift / offset / normalize / convert / stats
│   └── index.ts     # public API of the core
├── vscode-host/     # the only layer that imports "vscode"
│   ├── extension.ts # activation & wiring
│   └── …            # diagnostics, hover, code actions, symbols, formatter, commands
└── util/            # shared pure helpers (time formatting/parsing)
test/                # vitest unit tests + fixtures
scripts/             # icon generator and adapter smoke test
docs/                # research, design notes, ADRs, verification report
```

This layering lets the entire feature set run under Node (the full unit suite + a headless smoke
test of the real esbuild bundle) without an editor runtime.

## Verification

`npm run verify` runs the full gate: strict typecheck, ESLint (including the *no vscode in core*
guardrail), the layering guardrail, Prettier, the unit tests, the esbuild bundle, the headless
adapter smoke test and `vsce package`. Results are recorded in
[docs/verification.md](docs/verification.md).
The packaged extension is ≈ 34.5 KB.

## Roadmap

- [ ] Karaoke preview panel (play the timing against an audio file)
- [ ] Plain-text lyric import with auto-timing
- [ ] Reading user-provided lyric files exported *by* the players themselves
      (`.krc` / `.yrc`); decryption of protected formats is out of scope

## License

[MIT](LICENSE)

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Security
issues are handled privately, see [SECURITY.md](SECURITY.md). This project
adopts the [Contributor Covenant](CODE_OF_CONDUCT.md).

## 中文简介

**LRC Toolkit** 是一个面向 LRC（同步歌词）文件的轻量级 VS Code 插件。LRC 是各大音乐播放器
（foobar2000、Poweramp、网易云等）通用的行级同步歌词格式，但编辑器生态长期缺乏完善支持。
本插件提供：语法高亮、13 类实时诊断（时间轴倒退、时间戳非法、逐词时间乱序、疑似编码错误等）、
时间戳悬停信息（绝对时间、offset 换算、与前句间隔、间奏检测）、时间轴排序、时间戳整体平移、
offset 标签烘焙、精度归一化、逐词时间剥离、多时间戳行展开、双语行合并与拆分（`原文|译文`）、
SRT/VTT 字幕导入与 SRT 导出（保真范围 = 时间轴 + 纯文本）、文档统计与格式化。

方向约定：按通用规范，正 `[offset:]` 让歌词**提前**显示（显示时间 = 时间戳 − offset，
见 [ADR 0004](docs/adr/0004-offset-sign-convention.md)）；个别播放器方向相反，此时可用
"反转 offset 符号" 命令翻转标签，时间戳保持不动。

排序会移除独立的 `[Chorus]`、`[Verse]` 等无时间戳段落标记，并在结果消息中提示丢弃行数；
不会将这些标记随歌词块移动。排序前请保留副本，或使用撤销恢复；也可启用
`lrcToolkit.sort.keepSectionLabels`，让每个标记吸附到其后第一个歌词行一并重排。带时间戳的
标记（如 `[00:12.00][Chorus]`）作为歌词文本保留。

架构上采用“无框架核心 + 薄适配层”分层（核心层通过 ESLint 强制禁止依赖 `vscode`），
零运行时依赖，打包后约 34.5 KB。详细设计见 [docs/design.md](docs/design.md)。
