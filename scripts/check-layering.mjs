/**
 * Layering guardrail: the framework-free core (src/core, src/util) must never
 * reference the vscode-host adapter layer — in any import form, static or
 * dynamic (`await import("…/vscode-host/…")`), both of which carry the
 * `vscode-host` path segment inside a string literal. Direct `vscode` imports
 * stay banned by the ESLint `no-restricted-imports` rule (see
 * eslint.config.mjs and docs/adr/0002-framework-free-core.md); this script
 * guards the other direction and runs as part of `npm run verify`.
 *
 * Doc comments that merely mention the adapter (e.g. the header of
 * `src/core/index.ts`) are stripped before scanning, so only real code
 * references are flagged.
 *
 * Usage: node scripts/check-layering.mjs   (from the repository root)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = "vscode-host";
const LAYERS = ["src/core", "src/util"];

/**
 * Blank out line comments (`//` to end of line) and block comments
 * (delimited star-slash pairs) while preserving line structure, so reported
 * line numbers match the original file. String literals are kept: static,
 * dynamic and `require` import specifiers all live inside them.
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  let mode = "code";
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (mode === "code") {
      if (ch === "/" && next === "/") {
        mode = "line";
        out += "  ";
        i += 2;
      } else if (ch === "/" && next === "*") {
        mode = "block";
        out += "  ";
        i += 2;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        mode = ch;
        out += ch;
        i += 1;
      } else {
        out += ch;
        i += 1;
      }
    } else if (mode === "line") {
      if (ch === "\n") {
        mode = "code";
        out += ch;
      } else {
        out += " ";
      }
      i += 1;
    } else if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        out += "  ";
        i += 2;
      } else {
        out += ch === "\n" ? "\n" : " ";
        i += 1;
      }
    } else {
      // Inside a string literal: keep escapes intact.
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
      } else {
        if (ch === mode) {
          mode = "code";
        }
        out += ch;
        i += 1;
      }
    }
  }
  return out;
}

/** Collect every `.ts` file under `dir`, recursively. */
function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const offenders = [];
  let scanned = 0;
  for (const layer of LAYERS) {
    for (const file of collectTsFiles(join(root, layer))) {
      scanned++;
      const lines = stripComments(readFileSync(file, "utf-8")).split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(FORBIDDEN)) {
          offenders.push(`${relative(root, file)}:${i + 1}`);
        }
      }
    }
  }

  if (offenders.length > 0) {
    console.error(`LAYERING FAILED — "${FORBIDDEN}" referenced inside the framework-free core:`);
    for (const offender of offenders) {
      console.error(` - ${offender}`);
    }
    process.exit(1);
  }
  console.log(
    `LAYERING OK — ${scanned} file(s) under ${LAYERS.join(" and ")} contain no code reference to "${FORBIDDEN}".`,
  );
}

try {
  main();
} catch (error) {
  console.error("LAYERING FAILED");
  console.error(error);
  process.exit(1);
}
