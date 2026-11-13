// Validates syntaxes/ohh.tmLanguage.json against the real corpus, outside
// any VS Code window, same approach as vscode-phh/test/tokenize-corpus.js:
// vscode-textmate + vscode-oniguruma run as a plain Node library, no
// Extension Development Host GUI launched.
"use strict";

const fs = require("fs");
const path = require("path");
const oniguruma = require("vscode-oniguruma");
const { Registry, INITIAL, parseRawGrammar } = require("vscode-textmate");

const GRAMMAR_PATH = path.join(__dirname, "..", "syntaxes", "ohh.tmLanguage.json");
const CORPUS_ROOT = path.join(__dirname, "..", "..", "ohh", "corpus");

async function loadOniguruma() {
  const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
  const wasmBin = fs.readFileSync(wasmPath).buffer;
  await oniguruma.loadWASM(wasmBin);
  return {
    createOnigScanner(patterns) {
      return new oniguruma.OnigScanner(patterns);
    },
    createOnigString(s) {
      return new oniguruma.OnigString(s);
    },
  };
}

function listCorpusFiles() {
  const out = [];
  for (const sub of ["valid", "invalid"]) {
    const dir = path.join(CORPUS_ROOT, sub);
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".ohh")) {
        out.push({ sub, path: path.join(dir, name), name });
      }
    }
  }
  return out;
}

function scopesAt(tokens, lineText, needle) {
  const idx = lineText.indexOf(needle);
  if (idx === -1) return null;
  for (const t of tokens) {
    if (idx >= t.startIndex && idx < t.endIndex) return t.scopes;
  }
  return null;
}

function tokenizeFile(grammar, text) {
  const lines = text.split(/\r?\n/);
  let ruleStack = INITIAL;
  const perLineTokens = [];
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;
    perLineTokens.push(result.tokens);
  }
  return { lines, perLineTokens };
}

async function main() {
  const vscodeOnigLib = loadOniguruma();
  const registry = new Registry({
    onigLib: vscodeOnigLib,
    loadGrammar: async (scopeName) => {
      if (scopeName !== "source.ohh") return null;
      const content = fs.readFileSync(GRAMMAR_PATH, "utf8");
      return parseRawGrammar(content, GRAMMAR_PATH);
    },
  });

  const grammar = await registry.loadGrammar("source.ohh");
  if (!grammar) throw new Error("failed to load source.ohh grammar");

  let failures = 0;
  function check(label, cond) {
    console.log(`[${cond ? "ok" : "FAIL"}] ${label}`);
    if (!cond) failures++;
  }

  const files = listCorpusFiles();
  check("found corpus files to tokenize", files.length > 0);

  for (const file of files) {
    const text = fs.readFileSync(file.path, "utf8");
    const { perLineTokens } = tokenizeFile(grammar, text);
    let anyErrorScope = false;
    for (const tokens of perLineTokens) {
      for (const t of tokens) {
        if (t.scopes.some((s) => s.includes("invalid"))) anyErrorScope = true;
      }
    }
    check(`${file.sub}/${file.name}: tokenizes with no 'invalid' scope`, !anyErrorScope);
  }

  // Targeted scope checks against the real spec-sourced example.
  {
    const file = path.join(CORPUS_ROOT, "valid", "holdem-cash-pokerstars.ohh");
    const text = fs.readFileSync(file, "utf8");
    const { lines, perLineTokens } = tokenizeFile(grammar, text);

    const gameTypeLineIdx = lines.findIndex((l) => l.includes('"game_type"'));
    const gameTypeScopes = scopesAt(
      perLineTokens[gameTypeLineIdx],
      lines[gameTypeLineIdx],
      '"Holdem"'
    );
    check(
      "game_type value \"Holdem\" gets string.quoted.double.special.enum.ohh",
      !!gameTypeScopes && gameTypeScopes.some((s) => s === "string.quoted.double.special.enum.ohh")
    );

    const keyScopes = scopesAt(perLineTokens[gameTypeLineIdx], lines[gameTypeLineIdx], '"game_type"');
    check(
      "the \"game_type\" key itself gets support.type.property-name.ohh (not the enum scope)",
      !!keyScopes && keyScopes.some((s) => s === "support.type.property-name.ohh")
    );

    const siteNameLineIdx = lines.findIndex((l) => l.includes('"site_name"'));
    const siteNameValueScopes = scopesAt(
      perLineTokens[siteNameLineIdx],
      lines[siteNameLineIdx],
      '"PokerStars"'
    );
    check(
      "an ordinary string value (site_name) gets plain string.quoted.double.ohh, not the enum scope",
      !!siteNameValueScopes &&
        siteNameValueScopes.some((s) => s === "string.quoted.double.ohh") &&
        !siteNameValueScopes.some((s) => s === "string.quoted.double.special.enum.ohh")
    );

    const tableSizeLineIdx = lines.findIndex((l) => l.includes('"table_size"'));
    const tableSizeScopes = scopesAt(perLineTokens[tableSizeLineIdx], lines[tableSizeLineIdx], "9");
    check(
      "a numeric value (table_size) gets constant.numeric.ohh",
      !!tableSizeScopes && tableSizeScopes.some((s) => s === "constant.numeric.ohh")
    );

    const isAllinLineIdx = lines.findIndex((l) => l.includes('"is_allin": true'));
    const boolScopes = scopesAt(perLineTokens[isAllinLineIdx], lines[isAllinLineIdx], "true");
    check(
      "a boolean value (is_allin: true) gets constant.language.ohh",
      !!boolScopes && boolScopes.some((s) => s === "constant.language.ohh")
    );

    const bracketLineIdx = 0;
    const bracketScopes = scopesAt(perLineTokens[bracketLineIdx], lines[bracketLineIdx], "{");
    check(
      "the opening brace gets punctuation.bracket.ohh",
      !!bracketScopes && bracketScopes.some((s) => s === "punctuation.bracket.ohh")
    );
  }

  // The multi-hand file must tokenize cleanly across the blank-line
  // separator between its two top-level {"ohh": ...} objects, this is
  // the TextMate-grammar equivalent of what tree-sitter-ohh's own
  // `document: repeat($._value)` root rule had to get right.
  {
    const file = path.join(CORPUS_ROOT, "valid", "multi-hand.ohh");
    const text = fs.readFileSync(file, "utf8");
    const { lines, perLineTokens } = tokenizeFile(grammar, text);
    const gameNumberLines = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.includes('"game_number"'));
    check("multi-hand.ohh has two game_number occurrences (one per hand)", gameNumberLines.length === 2);
    for (const { l, i } of gameNumberLines) {
      const scopes = scopesAt(perLineTokens[i], l, '"game_number"');
      check(
        `multi-hand.ohh line ${i}: "game_number" key still tokenizes correctly across the blank-line boundary`,
        !!scopes && scopes.some((s) => s === "support.type.property-name.ohh")
      );
    }
  }

  console.log();
  if (failures > 0) {
    console.log(`${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("All grammar checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
