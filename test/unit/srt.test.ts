import { describe, expect, it } from "vitest";

import { formatSrt, lrcToSrtCues, parseSrt, srtCuesToLrc } from "../../src/core/services/srt";
import { parseDocument } from "../../src/core/parser";

describe("parseSrt", () => {
  it("parses indexed blocks with comma milliseconds", () => {
    const srt =
      "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:05,000 --> 00:00:06,000\nWorld\n";
    expect(parseSrt(srt)).toEqual({
      cues: [
        { startMs: 1_000, endMs: 3_500, text: "Hello" },
        { startMs: 5_000, endMs: 6_000, text: "World" },
      ],
      droppedBlocks: 0,
    });
  });

  it("tolerates a BOM and CRLF line endings", () => {
    const srt = "\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n";
    expect(parseSrt(srt).cues).toEqual([{ startMs: 1_000, endMs: 2_000, text: "Hi" }]);
  });

  it("accepts a missing index line", () => {
    expect(parseSrt("00:00:01,000 --> 00:00:02,000\nHi\n").cues).toHaveLength(1);
  });

  it("joins a block's multi-line text into one lyric line", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nline one\nline two\n";
    expect(parseSrt(srt).cues[0]?.text).toBe("line one line two");
  });

  it("accepts WebVTT dot separators and optional hours", () => {
    // Bare .vtt: no WEBVTT header, MM:SS.mmm timings.
    const bare = parseSrt("00:01.000 --> 00:02.000\nHi\n");
    expect(bare.cues).toEqual([{ startMs: 1_000, endMs: 2_000, text: "Hi" }]);
    expect(bare.droppedBlocks).toBe(0);
    // Mixed: dot fraction without hours on the left, HH:MM:SS.mmm on the right.
    const mixed = parseSrt("01:02.500 --> 00:01:02.750\nHi\n");
    expect(mixed.cues[0]?.startMs).toBe(62_500);
    expect(mixed.cues[0]?.endMs).toBe(62_750);
  });

  it("drops the WEBVTT header without counting it, and NOTE/STYLE blocks with", () => {
    const srt = [
      "WEBVTT - title",
      "",
      "NOTE",
      "this is a note",
      "",
      "STYLE",
      "::cue {",
      "  color: red",
      "}",
      "",
      "00:01.000 --> 00:02.000",
      "Hi",
      "",
    ].join("\n");
    const result = parseSrt(srt);
    expect(result.cues).toEqual([{ startMs: 1_000, endMs: 2_000, text: "Hi" }]);
    expect(result.droppedBlocks).toBe(2);
  });

  it("strips <i>-family inline markup but keeps lone angle brackets", () => {
    const tagged = parseSrt("1\n00:00:01,000 --> 00:00:02,000\n<i>Hello</i> <b>world</b>\n");
    expect(tagged.cues[0]?.text).toBe("Hello world");
    const heart = parseSrt("1\n00:00:01,000 --> 00:00:02,000\nI <3 you\n");
    expect(heart.cues[0]?.text).toBe("I <3 you");
  });

  it("counts unparseable and text-less blocks as dropped", () => {
    const garbage = parseSrt("garbage line\n\n00:00:01,000 --> 00:00:02,000\nHi\n");
    expect(garbage.cues).toHaveLength(1);
    expect(garbage.droppedBlocks).toBe(1);
    const empty = parseSrt("1\n00:00:01,000 --> 00:00:02,000\n");
    expect(empty.cues).toHaveLength(0);
    expect(empty.droppedBlocks).toBe(1);
  });
});

describe("formatSrt", () => {
  it("writes one block per cue with recomputed end times", () => {
    // End = next start − 1 ms; the final block gets start + 2 s.
    expect(
      formatSrt([
        { startMs: 1_000, text: "a" },
        { startMs: 2_000, text: "b" },
      ]),
    ).toBe("1\n00:00:01,000 --> 00:00:01,999\na\n\n2\n00:00:02,000 --> 00:00:04,000\nb\n");
  });

  it("clamps equal starts to a zero-length block instead of reversing", () => {
    // Bilingual pairs share a start; the first block must not end before it.
    expect(
      formatSrt([
        { startMs: 1_000, text: "a" },
        { startMs: 1_000, text: "b" },
      ]),
    ).toContain("00:00:01,000 --> 00:00:01,000");
  });

  it("renders hours beyond one and returns empty for no cues", () => {
    expect(formatSrt([{ startMs: 3_723_456, text: "x" }])).toBe(
      "1\n01:02:03,456 --> 01:02:05,456\nx\n",
    );
    expect(formatSrt([])).toBe("");
  });

  it("is stable under parse → format → parse", () => {
    const srt =
      "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:05,000 --> 00:00:06,000\nWorld\n";
    const firstPass = formatSrt(parseSrt(srt).cues);
    const parsed = parseSrt(firstPass);
    expect(parsed.droppedBlocks).toBe(0);
    // Starts and plain text are the fidelity contract; ends are recomputed.
    expect(parsed.cues.map((cue) => [cue.startMs, cue.text])).toEqual([
      [1_000, "Hello"],
      [5_000, "World"],
    ]);
    expect(formatSrt(parsed.cues)).toBe(firstPass);
  });
});

describe("srtCuesToLrc", () => {
  it("rounds timestamps onto the centisecond grid", () => {
    expect(
      srtCuesToLrc([
        { startMs: 1_234, endMs: 2_000, text: "one" },
        { startMs: 62_500, endMs: 63_000, text: "two" },
      ]),
    ).toBe("[00:01.23]one\n[01:02.50]two\n");
  });

  it("returns empty text for zero cues", () => {
    expect(srtCuesToLrc([])).toBe("");
  });
});

describe("lrcToSrtCues", () => {
  it("exports effective times (offset baked) and clamps at zero", () => {
    expect(lrcToSrtCues(parseDocument("[offset:+500]\n[00:10.00]a\n"))).toEqual([
      { startMs: 9_500, text: "a" },
    ]);
    // display time = timestamp − offset would go negative; SRT cannot.
    expect(lrcToSrtCues(parseDocument("[offset:+30000]\n[00:10.00]a\n"))).toEqual([
      { startMs: 0, text: "a" },
    ]);
  });

  it("strips enhanced word timings and uses only the first stamp", () => {
    const cues = lrcToSrtCues(
      parseDocument("[00:10.00][00:20.00] <00:10.50>soft <00:11.00>lyrics\n"),
    );
    expect(cues).toEqual([{ startMs: 10_000, text: "soft lyrics" }]);
  });

  it("skips tags, unknown lines and text-less cues", () => {
    const cues = lrcToSrtCues(parseDocument("[ti:x]\nplain prose\n[00:30.00]\n[00:40.00]real\n"));
    expect(cues).toEqual([{ startMs: 40_000, text: "real" }]);
  });

  it("keeps CJK word-timing boundaries tight and latin ones spaced (review F5)", () => {
    const cjk = lrcToSrtCues(parseDocument("[00:10.00]<00:10.50>你<00:11.00>好<00:12.00>世界\n"));
    expect(cjk[0]?.text).toBe("你好世界");
    const latin = lrcToSrtCues(parseDocument("[00:10.00]<00:10.50>soft<00:11.00>lyrics\n"));
    expect(latin[0]?.text).toBe("soft lyrics");
  });
});

describe("parseSrt rejection and tolerance edges (review wave)", () => {
  it("drops blocks whose seconds exceed 59 instead of silently carrying them (F1)", () => {
    const result = parseSrt("1\n00:00:60,000 --> 00:00:70,000\nx\n");
    expect(result.cues).toHaveLength(0);
    expect(result.droppedBlocks).toBe(1);
  });

  it("accepts trailing VTT cue settings instead of dropping the whole block (F2)", () => {
    const result = parseSrt("00:01.000 --> 00:02.000 align:start line:10\nhello\n");
    expect(result.cues).toEqual([{ startMs: 1_000, endMs: 2_000, text: "hello" }]);
    expect(result.droppedBlocks).toBe(0);
  });

  it("accepts WebVTT hours beyond two digits (F3)", () => {
    const result = parseSrt("WEBVTT\n\n100:00:00.000 --> 100:00:05.000\nx\n");
    expect(result.cues[0]?.startMs).toBe(360_000_000);
    expect(result.droppedBlocks).toBe(0);
  });

  it("drops a block that smuggles a second timing line into its text (F6)", () => {
    const result = parseSrt(
      "1\n00:00:01,000 --> 00:00:02,000\n00:00:03,000 --> 00:00:04,000\ntext\n",
    );
    expect(result.cues).toHaveLength(0);
    expect(result.droppedBlocks).toBe(1);
  });

  it("round-trips a VTT file with dot separators and no hours (R8)", () => {
    const source = "WEBVTT\n\n00:01.000 --> 00:02.000\nhello\n\n00:05.000 --> 00:06.500\nworld\n";
    const once = parseSrt(source);
    const formatted = formatSrt(once.cues.map((cue) => ({ startMs: cue.startMs, text: cue.text })));
    const twice = parseSrt(formatted);
    expect(twice.cues.map((cue) => [cue.startMs, cue.text])).toEqual([
      [1_000, "hello"],
      [5_000, "world"],
    ]);
  });
});
