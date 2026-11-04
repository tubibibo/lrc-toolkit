# Research: choosing the direction

*Date: 2026-11-05. Sources: GitHub search API, VS Code Marketplace gallery API, web search.*

## Goal

Find a **niche ("冷门") but real** direction for a **lightweight** editor plugin, verified
against what already exists on GitHub and the VS Code Marketplace, so the project fills a gap
instead of duplicating saturated areas (linters, themes, AI helpers, etc.).

## Candidate evaluation

The chosen direction must satisfy:

1. An active file format / tooling ecosystem (so demand is real), but
2. Weak or fragmented *editor* support (so the plugin adds value), and
3. A scope small enough to stay dependency-free and fully testable (so it stays lightweight).

## The LRC (synced lyrics) ecosystem — demand is real

LRC is the de-facto line-synced lyrics format used by most music players (foobar2000,
Poweramp, NetEase Cloud Music, local karaoke tools). GitHub shows a lively ecosystem:

| Project | Stars (2026-11-05) | What it does |
| --- | --- | --- |
| [LDDC](https://github.com/chenmozhijin/LDDC) | ~1876 | Precise lyrics (word-by-line) download & matching tool |
| [ZonyLrcToolsX](https://github.com/real-zony/ZonyLrcToolsX) | ~1795 | Batch lyrics downloader |
| [syrics](https://github.com/akashrchandran/syrics) | ~251 | Fetch Spotify lyrics into `.lrc` files |
| [lrcput](https://github.com/JustOptimize/lrcput) | ~56 | Embeds LRC files into FLAC/M4A/MP3 |
| [lrclib-fetcher-ts](https://github.com/leshicodes/lrclib-fetcher-ts) | ~45 | Fetch synced lyrics from LRCLIB |
| [amll-ttml-tool / amll-editor](https://github.com/amll-dev) | 68–404 | Apple-Music-style TTML syllable editors |
| [Voxen-LRC-Editor](https://github.com/Raqhael-ux/Voxen-LRC-Editor) | ~29 | Web-based synced-lyrics editor |

## Editor support — fragmented, no complete toolkit

Marketplace search for `lrc` (gallery API, 2026-11-05) returned only single-purpose or
viewer-type extensions:

| Extension | Kind | Gap |
| --- | --- | --- |
| [LRC Offset Adjuster](https://marketplace.visualstudio.com/items?itemName=xinyo.lrc-offset-adjuster) | Single command | Only shifts offsets — no parsing, diagnostics or other tooling |
| [XLRC Editor](https://marketplace.visualstudio.com/items?itemName=boof2015.xlrc-editor) | Custom editor | Targets NetEase XLRC, not standard LRC editing |
| [Lyrics/Subtitles Support](https://marketplace.visualstudio.com/items?itemName=Aster.vscode-subtitles) | Grammar | Mixed subtitle support, no LRC-specific tooling |
| [vscode music player](https://marketplace.visualstudio.com/items?itemName=sym1018.vscode-music-player-sym1018), [Lyrielle](https://marketplace.visualstudio.com/items?itemName=kafeina.lyrielle), [Now Playing Lyrics](https://marketplace.visualstudio.com/items?itemName=maniyadv.now-playing-lyrics), [spotilyrics](https://marketplace.visualstudio.com/items?itemName=therepanic.spotilyrics), [Lyrics Box](https://marketplace.visualstudio.com/items?itemName=JoelManisali.orbit-lyrics-box), [LyricFlow](https://marketplace.visualstudio.com/items?itemName=husainabdurrohim.vscode-lyrics) | Viewers/players | *Display* lyrics while music plays — none help *author* LRC files |
| [SongTxt-vscode](https://github.com/gusper/SongTxt-vscode) | Grammar | Chord/tablature-oriented SongTxt format, not LRC |

GitHub search (`vscode lrc`, `vscode lyrics extension`) likewise surfaces no comprehensive
editing toolkit — only a 0★ generator experiment
([VSCODE_lrc-new](https://github.com/Howard-Zhou-77/VSCODE_lrc-new)) and unrelated projects.
The best-known LRC syntax file outside editors is a basic Vim highlighting script.

## Conclusion

**Direction: a VS Code extension that treats `.lrc` as a first-class language** — grammar,
live diagnostics, hovers, sorting/offset/precision tooling, statistics — implemented as a
framework-free, zero-dependency TypeScript core with a thin adapter. This is niche (no saturated
competition), real (large downstream ecosystem), and light (the whole format fits in a few
hundred lines of pure logic, fully unit-testable).

The resulting project is **LRC Toolkit** (this repository).
