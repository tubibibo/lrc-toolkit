import * as vscode from "vscode";

import { inspectAt } from "../core";
import { formatClock } from "../util/time";
import type { DocumentStore } from "./documentStore";
import { getSettings } from "./config";

export function registerHover(store: DocumentStore): vscode.Disposable {
  return vscode.languages.registerHoverProvider("lrc", {
    provideHover(document, position): vscode.Hover | null {
      const lrcDoc = store.get(document);
      const settings = getSettings();
      const target = inspectAt(lrcDoc, document.offsetAt(position));
      const markdown = renderHover(target, settings.gapThresholdSeconds);
      return markdown ? new vscode.Hover(new vscode.MarkdownString(markdown)) : null;
    },
  });
}

function formatDelta(deltaMs: number): string {
  const seconds = deltaMs / 1000;
  const sign = seconds >= 0 ? "+" : "-";
  return `${sign}${Math.abs(seconds).toFixed(2)} s`;
}

function renderHover(
  target: ReturnType<typeof inspectAt>,
  gapThresholdSeconds: number,
): string | null {
  switch (target?.kind) {
    case "timestamp": {
      const lines: string[] = [];
      lines.push(
        `**${formatClock(target.stamp.totalMs)}** (${(target.stamp.totalMs / 1000).toFixed(2)} s)`,
      );
      if (target.effectiveMs !== null && target.effectiveMs !== target.stamp.totalMs) {
        lines.push(`Effective with \`[offset:]\`: **${formatClock(target.effectiveMs)}**`);
      }
      if (target.prevEffectiveMs !== null && target.effectiveMs !== null) {
        lines.push(
          `Δ from previous line: ${formatDelta(target.effectiveMs - target.prevEffectiveMs)}`,
        );
      }
      if (target.nextEffectiveMs !== null && target.effectiveMs !== null) {
        const gap = target.nextEffectiveMs - target.effectiveMs;
        const instrumental = gap > gapThresholdSeconds * 1000 ? " — likely instrumental" : "";
        lines.push(`Gap to next line: ${formatDelta(gap)}${instrumental}`);
      }
      return lines.join("\n\n");
    }
    case "word-timing": {
      const delta = target.stamp.totalMs - target.cueStartMs;
      return `**Word timing** — starts ${formatDelta(delta)} after the line's timestamp.`;
    }
    case "tag": {
      return `**${target.key}:** ${target.description}`;
    }
    default:
      return null;
  }
}
