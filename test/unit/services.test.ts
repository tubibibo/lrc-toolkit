import { describe, expect, it } from "vitest";

import { parseDocument } from "../../src/core/parser";
import { sortCues } from "../../src/core/services/sort";
import { shiftTimestamps } from "../../src/core/services/shift";
import { applyOffsetTag, invertOffsetSign } from "../../src/core/services/offset";
import { normalizePrecision, normalizeSpacing } from "../../src/core/services/normalize";
import { expandMultiStampLines, stripWordTimings } from "../../src/core/services/convert";
import { mergeBilingualPairs, splitBilingualLines } from "../../src/core/services/bilingual";
import { computeStats, formatStatsReport } from "../../src/core/services/stats";
import { runCommand } from "../../src/core/commands";
import { isCommandId } from "../../src/core/commands";
import { analyze } from "../../src/core/analyzer";

describe("sortCues", () => {
  it("sorts cues and keeps tags first, preserving stable ties", () => {
    const doc = parseDocument("[ti:x]\n[00:10.00]b\n[00:05.00]a\n[00:10.00]c\n");
    const result = sortCues(doc);
    expect(result?.edit.newText).toBe("[ti:x]\n[00:05.00]a\n[00:10.00]b\n[00:10.00]c\n");
    expect(result?.cueCount).toBe(3);
    expect(result?.droppedLines).toBe(0);
  });

  it("keeps the blank separator between header and lyrics when present", () => {
    const doc = parseDocument("[ti:x]\n\n[00:10.00]b\n[00:05.00]a\n");
    expect(sortCues(doc)?.edit.newText).toBe("[ti:x]\n\n[00:05.00]a\n[00:10.00]b\n");
  });

  it("keeps each line's own terminator when sorting a mixed-EOL document", () => {
    const text = "[ti:x]\r\n[00:10.00]b\n[00:05.00]a\n";
    const result = sortCues(parseDocument(text));
    expect(result?.edit.newText).toBe("[ti:x]\r\n[00:05.00]a\n[00:10.00]b\n");
  });

  it("keeps a document without a trailing break breakless after sorting", () => {
    const text = "[00:02.00]b\r\n[00:01.00]a";
    const result = sortCues(parseDocument(text));
    expect(result?.edit.newText).toBe("[00:01.00]a\r\n[00:02.00]b");
  });

  it("keeps metadata tags on top with their own terminators (README contract)", () => {
    // Locks the README promise "tags stay on top": a tag line that appears
    // between cues moves back above every cue and keeps its own terminator.
    const doc = parseDocument("[00:10.00]a\n[tr:x]\n[00:05.00]b\n");
    const result = sortCues(doc);
    expect(result?.edit.newText).toBe("[tr:x]\n[00:05.00]b\n[00:10.00]a\n");
    expect(result?.cueCount).toBe(2);
    expect(result?.droppedLines).toBe(0);
  });

  it("keeps an inline label with its timestamp and adds no trailing break (README contract)", () => {
    // Locks the README promise that "[00:12.00][Chorus] … remains with its
    // timestamp", and that sorting a breakless document stays breakless.
    const text = "[00:02.00]b\r\n[00:01.00][Chorus]a";
    const result = sortCues(parseDocument(text));
    expect(result?.edit.newText).toBe("[00:01.00][Chorus]a\r\n[00:02.00]b");
    expect(result?.edit.newText).toContain("[Chorus]");
    expect(result?.edit.newText.endsWith("\n")).toBe(false);
    expect(result?.edit.newText.endsWith("\r")).toBe(false);
  });

  it("does not let a uniform offset tag change the relative order", () => {
    const doc = parseDocument("[offset:+8000]\n[00:12.00]a\n[00:05.00]b\n");
    expect(sortCues(doc)?.edit.newText).toBe("[offset:+8000]\n[00:05.00]b\n[00:12.00]a\n");
  });

  it("returns null when there is nothing to sort", () => {
    expect(sortCues(parseDocument("[ti:x]\n"))).toBeNull();
    expect(sortCues(parseDocument(""))).toBeNull();
  });

  it("preserves trailing blank lines and the final newline", () => {
    const doc = parseDocument("[00:02.00]b\n[00:01.00]a\n\n\n");
    expect(sortCues(doc)?.edit.newText).toBe("[00:01.00]a\n[00:02.00]b\n\n\n");
  });

  it("drops interior blank lines while sorting", () => {
    const doc = parseDocument("[00:02.00]b\n\n\n[00:01.00]a\n");
    expect(sortCues(doc)?.edit.newText).toBe("[00:01.00]a\n[00:02.00]b\n");
  });

  it("sorts CR-only documents without converting their line endings", () => {
    const doc = parseDocument("[00:02.00]b\r[00:01.00]a\r");
    expect(sortCues(doc)?.edit.newText).toBe("[00:01.00]a\r[00:02.00]b\r");
  });

  it("reports dropped unknown and interior blank lines, keeping the separator", () => {
    const doc = parseDocument("[ti:x]\n\n[00:10.00]b\n\n[xyz]unknown\n\n[00:05.00]a\n");
    const result = sortCues(doc);
    expect(result?.edit.newText).toBe("[ti:x]\n\n[00:05.00]a\n[00:10.00]b\n");
    expect(result?.cueCount).toBe(2);
    // 1 unknown + 2 interior blanks dropped; the separator blank is restored, not counted.
    expect(result?.droppedLines).toBe(3);
  });

  it("silently sorts a document without anything to drop", () => {
    const outcome = runCommand("sortByTimestamp", "[ti:x]\n[00:02.00]b\n[00:01.00]a\n");
    expect(outcome.messages).toEqual([]);
    expect(outcome.edits).toHaveLength(1);
  });

  it("keeps unrecognized lines attached to their next cue when asked", () => {
    // The label sticks to the first cue that follows it ([00:05.00]) and
    // travels with that cue through the sort, staying directly above it.
    const doc = parseDocument("[00:10.00]b\n[Chorus]\n[00:05.00]a\n");
    const result = sortCues(doc, { keepUnrecognized: true });
    expect(result?.edit.newText).toBe("[Chorus]\n[00:05.00]a\n[00:10.00]b\n");
    expect(result?.droppedLines).toBe(0);
  });

  it("still drops unrecognized lines with no following cue when keeping", () => {
    const doc = parseDocument("[Chorus]\n[00:05.00]a\n[00:10.00]b\n[outro]\n");
    const result = sortCues(doc, { keepUnrecognized: true });
    expect(result?.edit.newText).toBe("[Chorus]\n[00:05.00]a\n[00:10.00]b\n");
    expect(result?.droppedLines).toBe(1);
  });

  it("keeps several labels above the same cue in their original order", () => {
    const doc = parseDocument("[00:10.00]b\n[Chorus]\n[Verse]\n[00:05.00]a\n");
    const result = sortCues(doc, { keepUnrecognized: true });
    expect(result?.edit.newText).toBe("[Chorus]\n[Verse]\n[00:05.00]a\n[00:10.00]b\n");
    expect(result?.droppedLines).toBe(0);
  });

  it("combines kept labels with bilingual pairs sharing one timestamp", () => {
    const doc = parseDocument("[00:10.00]Hello\n[00:10.00]你好\n[Chorus]\n[00:05.00]A\n");
    const result = sortCues(doc, { keepUnrecognized: true });
    expect(result?.edit.newText).toBe("[Chorus]\n[00:05.00]A\n[00:10.00]Hello\n[00:10.00]你好\n");
    expect(result?.droppedLines).toBe(0);
  });

  it("passes keepUnrecognized through the command layer", () => {
    const outcome = runCommand("sortByTimestamp", "[00:10.00]b\n[Chorus]\n[00:05.00]a\n", {
      keepUnrecognized: true,
    });
    expect(outcome.messages).toEqual([]);
    expect(outcome.edits[0]?.newText).toBe("[Chorus]\n[00:05.00]a\n[00:10.00]b\n");
  });
});

describe("shiftTimestamps", () => {
  it("shifts all stamps and re-renders canonically", () => {
    const doc = parseDocument("[1:02.5]a\n[00:02.00]b\n");
    const { edits, clampedCount } = shiftTimestamps(doc, 250);
    expect(clampedCount).toBe(0);
    expect(edits).toHaveLength(2);
    expect(edits[0]).toEqual({ start: 0, end: 8, newText: "[01:02.7]" });
    expect(edits[1]?.newText).toBe("[00:02.25]");
  });

  it("clamps stamps that would go negative", () => {
    const doc = parseDocument("[00:01.50]a\n[00:02.00]b\n");
    const { edits, clampedCount } = shiftTimestamps(doc, -2000);
    expect(clampedCount).toBe(1);
    expect(edits.every((edit) => edit.newText === "[00:00.00]")).toBe(true);
  });

  it("shifts word timings together with line stamps", () => {
    const text = "[00:10.00] <00:10.50>hello\n";
    const { edits } = shiftTimestamps(parseDocument(text), 5000);
    expect(applyEdits(text, edits)).toBe("[00:15.00] <00:15.50>hello\n");
  });

  it("skips timestamps the shift leaves unchanged", () => {
    const outcome = runCommand("shiftTimestamps", "[00:10.00]a\n", { deltaMs: 0 });
    expect(outcome.edits).toHaveLength(0);
    expect(outcome.messages[0]).toContain("Nothing to shift");
  });

  it("still canonicalizes non-canonical stamps on a zero shift", () => {
    const { edits } = shiftTimestamps(parseDocument("[1:2.5]a\n"), 0);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toBe("[01:02.5]");
  });

  it("keeps four-digit-minute output parseable", () => {
    const text = "[999:59.500]a\n";
    const { edits } = shiftTimestamps(parseDocument(text), 1000);
    expect(applyEdits(text, edits)).toBe("[1000:00.500]a\n");
    expect(analyze(parseDocument("[1000:00.500]a\n"))).toEqual([]);
  });
});

describe("applyOffsetTag", () => {
  it("bakes the offset into stamps and removes the tag", () => {
    const doc = parseDocument("[offset:+500]\n[00:10.00]a\n[00:20.00]b\n");
    const result = applyOffsetTag(doc);
    expect(result).not.toBeNull();
    expect(result?.offsetMs).toBe(500);
    expect(result?.shiftedCount).toBe(2);
    // Applying the edits by hand reproduces the intended document.
    const text = doc.text;
    const applied = applyEdits(text, result!.edits);
    expect(applied).toBe("[00:09.50]a\n[00:19.50]b\n");
  });

  it("bakes the offset into word timings too", () => {
    const text = "[offset:+500]\n[00:10.00] <00:10.50>hello\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(applyEdits(text, result!.edits)).toBe("[00:09.50] <00:10.00>hello\n");
  });

  it("returns null when no valid offset tag exists", () => {
    expect(applyOffsetTag(parseDocument("[00:01.00]a\n"))).toBeNull();
    expect(applyOffsetTag(parseDocument("[offset:abc]\n"))).toBeNull();
  });

  it("applies offset tags in CR-only documents without stray breaks", () => {
    const text = "[offset:+500]\r[00:10.00]a\r";
    const result = applyOffsetTag(parseDocument(text));
    expect(applyEdits(text, result!.edits)).toBe("[00:09.50]a\r");
  });

  it("applies an offset tag that shares a line with another tag", () => {
    const text = "[ti:x][offset:+500]\n[00:10.00]a\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(result?.offsetMs).toBe(500);
    // Only the offset token is removed; [ti:x] survives on the same line.
    expect(applyEdits(text, result!.edits)).toBe("[ti:x]\n[00:09.50]a\n");
  });

  it("removes only the offset token when a sibling tag follows it", () => {
    const text = "[offset:+500][ti:x]\n[00:10.00]a\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(applyEdits(text, result!.edits)).toBe("[ti:x]\n[00:09.50]a\n");
  });

  it("keeps trailing text on the offset tag's line instead of deleting it", () => {
    // A handwritten note after the tag is lyric text — the toolkit never
    // deletes text, so the line degrades to a token-only removal.
    const text = "[offset:+500] 手写注释\n[00:10.00]a\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(applyEdits(text, result!.edits)).toBe(" 手写注释\n[00:09.50]a\n");
  });

  it("keeps unclassified bracket tokens that share the offset tag's line", () => {
    // [xx] is not a tag (no colon), so it never enters `additional`; without
    // the trailing-content check the whole line used to be deleted.
    const text = "[offset:+500][xx]\n[00:10.00]a\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(applyEdits(text, result!.edits)).toBe("[xx]\n[00:09.50]a\n");
  });

  it("still deletes the whole line when the tag is alone on it", () => {
    const text = "[00:10.00]a\n[offset:+500]\n[00:20.00]b\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(result?.shiftedCount).toBe(2);
    expect(applyEdits(text, result!.edits)).toBe("[00:09.50]a\n[00:19.50]b\n");
  });

  it("reports duplicates when several offset tags share one line", () => {
    const text = "[offset:+500][offset:+600]\n[00:10.00]a\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(result?.offsetMs).toBe(500);
    expect(result?.remainingOffsetTags).toBe(1);
    expect(applyEdits(text, result!.edits)).toBe("[offset:+600]\n[00:09.50]a\n");
    const issues = analyze(parseDocument(text));
    expect(issues.filter((issue) => issue.code === "duplicate-offset")).toHaveLength(1);
  });

  it("bakes the first offset tag and reports leftover duplicates", () => {
    const text = "[offset:+500]\n[offset:-200]\n[00:10.00]a\n";
    const result = applyOffsetTag(parseDocument(text));
    expect(result?.offsetMs).toBe(500);
    expect(result?.remainingOffsetTags).toBe(1);
    expect(applyEdits(text, result!.edits)).toBe("[offset:-200]\n[00:09.50]a\n");

    const outcome = runCommand("applyOffsetTag", text);
    expect(
      outcome.messages.some((message) => message.includes("additional [offset:] tag(s) remain")),
    ).toBe(true);
  });
});

describe("normalizePrecision", () => {
  it("rewrites stamps onto the requested grid", () => {
    const doc = parseDocument("[00:01.249]a\n[00:01.255]b\n[01:02]c\n");
    const edits = normalizePrecision(doc, 2);
    expect(edits.map((edit) => edit.newText)).toEqual(["[00:01.25]", "[00:01.26]", "[01:02.00]"]);
  });

  it("produces no edits when already normalized", () => {
    const doc = parseDocument("[00:01.25]a\n[00:01.26]b\n");
    expect(normalizePrecision(doc, 2)).toHaveLength(0);
  });

  it("normalizes word-timing precision alongside line stamps", () => {
    const text = "[00:10.000] <00:10.500>hello\n";
    const edits = normalizePrecision(parseDocument(text), 2);
    expect(applyEdits(text, edits)).toBe("[00:10.00] <00:10.50>hello\n");
  });
});

describe("normalizeSpacing", () => {
  const text = "[00:01.00]   text  \n[ti:x]   \n[00:02.00] tight\n";

  it("strips stray spacing without adding any by default", () => {
    const edits = normalizeSpacing(parseDocument(text), false);
    const applied = applyEdits(text, edits);
    expect(applied).toBe("[00:01.00]text\n[ti:x]\n[00:02.00]tight\n");
  });

  it("can enforce one space after the timestamp", () => {
    const edits = normalizeSpacing(parseDocument(text), true);
    const applied = applyEdits(text, edits);
    expect(applied).toBe("[00:01.00] text\n[ti:x]\n[00:02.00] tight\n");
  });

  it("trims whitespace-only lines too", () => {
    const text = "[00:01.00]a   \n   \n[ti:x]  \n";
    const edits = normalizeSpacing(parseDocument(text), false);
    expect(applyEdits(text, edits)).toBe("[00:01.00]a\n\n[ti:x]\n");
  });
});

describe("stripWordTimings", () => {
  it("removes valid word timings and collapses spacing", () => {
    const text = "[00:10.00] <00:11.00>word  <00:12.00>end\n";
    const { edits, lineCount } = stripWordTimings(parseDocument(text));
    expect(lineCount).toBe(1);
    expect(applyEdits(text, edits)).toBe("[00:10.00]word end\n");
  });

  it("removes timing-shaped malformed word timings too", () => {
    const text = "[00:10.00]<00:60>x\n";
    const { edits } = stripWordTimings(parseDocument(text));
    expect(applyEdits(text, edits)).toBe("[00:10.00]x\n");
  });

  it("keeps lyrics containing non-timing angle brackets intact", () => {
    const text = "[00:20.00]第<2>段 <b> I <3 you\n";
    const { edits, lineCount } = stripWordTimings(parseDocument(text));
    expect(lineCount).toBe(0);
    expect(edits).toHaveLength(0);
  });
});

describe("expandMultiStampLines", () => {
  it("expands into one line per timestamp", () => {
    const text = "[00:01.00][00:02.00]chorus\n";
    const { edits, lineCount } = expandMultiStampLines(parseDocument(text));
    expect(lineCount).toBe(1);
    expect(applyEdits(text, edits)).toBe("[00:01.00]chorus\n[00:02.00]chorus\n");
  });

  it("joins expanded lines with the source line's own terminator", () => {
    const text = "[00:01.00][00:02.00]chorus\r\n[00:03.00]next\n";
    const { edits } = expandMultiStampLines(parseDocument(text));
    expect(edits[0]?.newText).toBe("[00:01.00]chorus\r\n[00:02.00]chorus");
  });

  it("ignores single-stamp lines", () => {
    expect(expandMultiStampLines(parseDocument("[00:01.00]a\n")).lineCount).toBe(0);
  });

  it("refuses to expand lines carrying inline bracket content", () => {
    const text = "[00:01.00][Chorus][00:02.00]text\n";
    const { edits, lineCount, skippedCount } = expandMultiStampLines(parseDocument(text));
    expect(edits).toHaveLength(0);
    expect(lineCount).toBe(0);
    expect(skippedCount).toBe(1);
    const outcome = runCommand("expandMultiStampLines", text);
    expect(outcome.messages.some((message) => message.includes("Skipped 1 line"))).toBe(true);
  });
});

describe("mergeBilingualPairs", () => {
  it("merges adjacent same-time lines keeping the first line's stamp", () => {
    const text = "[00:10.00]Hello world\n[00:10.00]你好世界\n";
    const { edits, pairCount, skippedCount } = mergeBilingualPairs(parseDocument(text));
    expect(pairCount).toBe(1);
    expect(skippedCount).toBe(0);
    expect(applyEdits(text, edits)).toBe("[00:10.00]Hello world|你好世界\n");
  });

  it("absorbs the second line's stamp and inherits the pair's terminator", () => {
    const text = "[00:9.5]a\r\n[00:09.50]b\r\n";
    const { edits } = mergeBilingualPairs(parseDocument(text));
    expect(applyEdits(text, edits)).toBe("[00:9.5]a|b\r\n");
  });

  it("never merges lines that are not adjacent or not at the same time", () => {
    expect(mergeBilingualPairs(parseDocument("[00:10.00]a\n[00:20.00]b\n")).pairCount).toBe(0);
    expect(mergeBilingualPairs(parseDocument("[00:10.00]a\n[ti:x]\n[00:10.00]b\n")).pairCount).toBe(
      0,
    );
    expect(mergeBilingualPairs(parseDocument("[00:10.00]a\n\n[00:10.00]b\n")).pairCount).toBe(0);
  });

  it("refuses pairs whose text carries a valid inline stamp (review R12)", () => {
    // The analyzer never flags a *valid* inline timestamp, but merging would
    // absorb it as lyrics — the promised "extra stamps are refused" covers
    // the valid shape too.
    const { pairCount, skippedCount } = mergeBilingualPairs(
      parseDocument("[00:10.00]see [00:15.00] here\n[00:10.00]译文\n"),
    );
    expect(pairCount).toBe(0);
    expect(skippedCount).toBe(1);
  });

  it("merges only the first two of three same-time lines", () => {
    const text = "[00:10.00]a\n[00:10.00]b\n[00:10.00]c\n";
    const { edits, pairCount } = mergeBilingualPairs(parseDocument(text));
    expect(pairCount).toBe(1);
    expect(applyEdits(text, edits)).toBe("[00:10.00]a|b\n[00:10.00]c\n");
  });

  it("refuses pairs it would have to guess about", () => {
    // Word timings would be deleted by the rewrite.
    const worded = mergeBilingualPairs(parseDocument("[00:10.00] <00:10.50>a\n[00:10.00]b\n"));
    expect(worded.pairCount).toBe(0);
    expect(worded.skippedCount).toBe(1);
    // A stray label or an extra stamp cannot be attributed to either side.
    expect(
      mergeBilingualPairs(parseDocument("[00:10.00][Chorus]a\n[00:10.00]b\n")).skippedCount,
    ).toBe(1);
    expect(
      mergeBilingualPairs(parseDocument("[00:10.00][00:11.00]a\n[00:10.00]b\n")).skippedCount,
    ).toBe(1);
    // An empty side is an instrumental marker, not a bilingual pair.
    expect(mergeBilingualPairs(parseDocument("[00:10.00]\n[00:10.00]b\n")).skippedCount).toBe(1);
    // An unescaped pipe in the original would corrupt the split-back.
    expect(mergeBilingualPairs(parseDocument("[00:10.00]a|b\n[00:10.00]c\n")).skippedCount).toBe(1);
  });

  it("accepts escaped pipes and keeps literal pipes in the translation", () => {
    const text = "[00:10.00]a\\|b\n[00:10.00]c|d\n";
    const { edits, skippedCount } = mergeBilingualPairs(parseDocument(text));
    expect(skippedCount).toBe(0);
    expect(applyEdits(text, edits)).toBe("[00:10.00]a\\|b|c|d\n");
  });
});

describe("splitBilingualLines", () => {
  it("splits at the first unescaped pipe and inherits the timestamp", () => {
    const text = "[00:10.00]Hello|你好\n";
    const { edits, lineCount } = splitBilingualLines(parseDocument(text));
    expect(lineCount).toBe(1);
    expect(applyEdits(text, edits)).toBe("[00:10.00]Hello\n[00:10.00]你好\n");
  });

  it("splits only at the first unescaped pipe, keeping pipes in the translation", () => {
    const text = "[00:10.00]a\\|b|c|d\n";
    const { edits } = splitBilingualLines(parseDocument(text));
    expect(applyEdits(text, edits)).toBe("[00:10.00]a\\|b\n[00:10.00]c|d\n");
  });

  it("keeps each side's spacing style and uses the line's own terminator", () => {
    const text = "[00:10.00] Hello | 世界\r\n[00:20.00]b\n";
    const { edits } = splitBilingualLines(parseDocument(text));
    expect(applyEdits(text, edits)).toBe("[00:10.00] Hello\r\n[00:10.00]世界\r\n[00:20.00]b\n");
  });

  it("ignores lines without a usable separator or with extra content", () => {
    expect(splitBilingualLines(parseDocument("[00:10.00]plain\n")).lineCount).toBe(0);
    // Several stamps: which one would the second line inherit?
    expect(splitBilingualLines(parseDocument("[00:10.00][00:20.00]a|b\n")).lineCount).toBe(0);
    expect(splitBilingualLines(parseDocument("[00:10.00] <00:10.50>a|b\n")).lineCount).toBe(0);
    // An unknown line's pipe is lyric content, not a separator.
    expect(splitBilingualLines(parseDocument("plain|prose\n")).lineCount).toBe(0);
    // A side that ends up empty is not a pair.
    expect(splitBilingualLines(parseDocument("[00:10.00]a|\n")).lineCount).toBe(0);
  });

  it("round-trips merge → split back to the original document", () => {
    const text = "[00:10.00]Hello world\n[00:10.00]你好世界\n[00:20.00]B\n";
    const merged = applyEdits(text, mergeBilingualPairs(parseDocument(text)).edits);
    expect(merged).toBe("[00:10.00]Hello world|你好世界\n[00:20.00]B\n");
    const splitBack = applyEdits(merged, splitBilingualLines(parseDocument(merged)).edits);
    expect(splitBack).toBe(text);
  });
});

describe("invertOffsetSign", () => {
  it("flips the sign of the first valid offset tag only", () => {
    const text = "[offset:+500]\n[offset:-200]\n[00:10.00]a\n";
    const result = invertOffsetSign(parseDocument(text));
    expect(result?.fromMs).toBe(500);
    expect(result?.toMs).toBe(-500);
    expect(applyEdits(text, result!.edits)).toBe("[offset:-500]\n[offset:-200]\n[00:10.00]a\n");
  });

  it("rewrites negative values with an explicit plus", () => {
    const text = "[offset:-250]\n";
    expect(applyEdits(text, invertOffsetSign(parseDocument(text))!.edits)).toBe("[offset:+250]\n");
  });

  it("flips unsigned values too and reaches tags sharing a line", () => {
    const text = "[ti:x][offset:500]\n[00:10.00]a\n";
    const result = invertOffsetSign(parseDocument(text));
    expect(applyEdits(text, result!.edits)).toBe("[ti:x][offset:-500]\n[00:10.00]a\n");
  });

  it("returns null without a valid offset tag", () => {
    expect(invertOffsetSign(parseDocument("[00:01.00]a\n"))).toBeNull();
    expect(invertOffsetSign(parseDocument("[offset:abc]\n"))).toBeNull();
  });

  it("reports the flip through the command layer", () => {
    const outcome = runCommand("invertOffsetSign", "[offset:+500]\n[00:10.00]a\n");
    expect(outcome.edits[0]?.newText).toBe("-500");
    expect(outcome.messages[0]).toContain("+500 → -500");
  });

  it("flips zero in the text domain, keeping the explicit sign (review F4)", () => {
    expect(
      applyEdits("[offset:+0]\n", invertOffsetSign(parseDocument("[offset:+0]\n"))!.edits),
    ).toBe("[offset:-0]\n");
    expect(
      applyEdits("[offset:-0]\n", invertOffsetSign(parseDocument("[offset:-0]\n"))!.edits),
    ).toBe("[offset:+0]\n");
    expect(applyEdits("[offset:0]\n", invertOffsetSign(parseDocument("[offset:0]\n"))!.edits)).toBe(
      "[offset:-0]\n",
    );
  });

  it("reports a zero flip with the tag text, not an unchanged millisecond pair", () => {
    const outcome = runCommand("invertOffsetSign", "[offset:+0]\n[00:10.00]a\n");
    expect(outcome.edits[0]?.newText).toBe("-0");
    expect(outcome.messages[0]).toContain("+0 → -0");
  });
});

describe("computeStats", () => {
  // The repeated text makes the pair a true duplicate: different texts at the
  // same start would be the bilingual convention and must not count.
  const text = "[ti:x]\n[offset:+1000]\n[00:10.00]a\n[00:10.00]a\n[00:40.00]c\n";

  it("counts cues, tags, duplicates and gaps under the offset", () => {
    const stats = computeStats(parseDocument(text), 8);
    expect(stats.cueCount).toBe(3);
    expect(stats.tagCount).toBe(2);
    expect(stats.duplicateTimestampCount).toBe(1);
    expect(stats.effectiveTimesMs).toEqual([9_000, 39_000]);
    expect(stats.durationMs).toBe(30_000);
    expect(stats.gaps).toEqual([{ fromMs: 9_000, toMs: 39_000, durationMs: 30_000 }]);
  });

  it("does not inflate duplicates for bilingual pairs with different texts", () => {
    const stats = computeStats(
      parseDocument("[00:10.00]Hello\n[00:10.00]你好\n[00:20.00]A\n[00:20.00]B\n"),
      8,
    );
    expect(stats.duplicateTimestampCount).toBe(0);
    expect(stats.cueCount).toBe(4);
  });

  it("still counts true duplicates alongside bilingual pairs", () => {
    const stats = computeStats(
      parseDocument("[00:10.00]Hello\n[00:10.00]你好\n[00:20.00]chorus\n[00:20.00]chorus\n"),
      8,
    );
    expect(stats.duplicateTimestampCount).toBe(1);
  });

  it("honours the threshold", () => {
    const stats = computeStats(parseDocument(text), 60);
    expect(stats.gaps).toEqual([]);
  });

  it("reports a zero duration for single-cue documents", () => {
    const stats = computeStats(parseDocument("[00:10.00]a\n"), 8);
    expect(stats.durationMs).toBe(0);
    const report = formatStatsReport(stats, 8);
    expect(report.some((line) => line.startsWith("Duration: 00:00.00 (00:10.00 → 00:10.00)"))).toBe(
      true,
    );
  });

  it("formats a readable report", () => {
    const stats = computeStats(parseDocument(text), 8);
    const report = formatStatsReport(stats, 8);
    expect(report[0]).toContain("Cues: 3");
    expect(report.some((line) => line.includes("Instrumental gaps > 8s: 1"))).toBe(true);
  });
});

describe("runCommand", () => {
  it("dispatches sort and returns one whole-document edit", () => {
    const outcome = runCommand("sortByTimestamp", "[00:10.00]b\n[00:05.00]a\n");
    expect(outcome.edits).toHaveLength(1);
    expect(outcome.edits[0]?.newText).toBe("[00:05.00]a\n[00:10.00]b\n");
  });

  it("reports a friendly noop for sorting a tag-only file", () => {
    const outcome = runCommand("sortByTimestamp", "[ti:x]\n");
    expect(outcome.edits).toHaveLength(0);
    expect(outcome.messages[0]).toContain("No timestamped lines");
  });

  it("explains when there is no offset tag to apply", () => {
    const outcome = runCommand("applyOffsetTag", "[00:01.00]a\n");
    expect(outcome.edits).toHaveLength(0);
    expect(outcome.messages[0]).toContain("No valid [offset:] tag");
  });

  it("reports clamped stamps when shifting backwards", () => {
    const outcome = runCommand("shiftTimestamps", "[00:01.00]a\n", { deltaMs: -5000 });
    expect(outcome.edits[0]?.newText).toBe("[00:00.00]");
    expect(outcome.messages[0]).toContain("clamped");
  });

  it("returns stats as messages", () => {
    const outcome = runCommand("showStats", "[00:10.00]a\n", { gapThresholdSeconds: 8 });
    expect(outcome.edits).toHaveLength(0);
    expect(outcome.messages.some((line) => line.startsWith("Cues:"))).toBe(true);
  });

  it("strips word timings through the command layer", () => {
    const outcome = runCommand("stripWordTimings", "[00:10.00] <00:11.00>word\n");
    expect(outcome.edits[0]?.newText).toBe("word");
    expect(outcome.messages[0]).toContain("Converted 1 line(s)");
  });

  it("merges and splits bilingual lines through the command layer", () => {
    const merged = runCommand("mergeBilingualLines", "[00:10.00]a\n[00:10.00]b\n");
    expect(merged.messages[0]).toContain("Merged 1 bilingual pair(s)");
    const split = runCommand("splitBilingualLines", "[00:10.00]a|b\n");
    expect(split.messages[0]).toContain("Split 1 line(s)");
    expect(runCommand("mergeBilingualLines", "[00:10.00]a\n[00:20.00]b\n").messages[0]).toContain(
      "No adjacent same-time bilingual pairs",
    );
    expect(runCommand("splitBilingualLines", "[00:10.00]plain\n").messages[0]).toContain(
      "No lines with an unescaped '|' separator",
    );
  });

  it("explains when there is no offset tag to invert", () => {
    const outcome = runCommand("invertOffsetSign", "[00:01.00]a\n");
    expect(outcome.edits).toHaveLength(0);
    expect(outcome.messages[0]).toContain("nothing to invert");
  });
});

describe("isCommandId", () => {
  it("accepts known ids and rejects unknown ones", () => {
    expect(isCommandId("sortByTimestamp")).toBe(true);
    expect(isCommandId("showStats")).toBe(true);
    expect(isCommandId("mergeBilingualLines")).toBe(true);
    expect(isCommandId("invertOffsetSign")).toBe(true);
    expect(isCommandId("somethingElse")).toBe(false);
  });
});

/** Apply plain-data edits to raw text (mirrors what the adapter does). */
function applyEdits(
  text: string,
  edits: Array<{ start: number; end: number; newText: string }>,
): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const edit of sorted) {
    out += text.slice(cursor, edit.start) + edit.newText;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}
