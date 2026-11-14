# vscode-ohh

The VS Code integration for OHH, same
thin-extension shape as `vscode-phh`: no parsing or validation logic lives
here. It contributes a TextMate grammar (a second, independent artifact
from `../tree-sitter-ohh`, kept in sync by testing both against the same
corpus, not by sharing code) and a thin `vscode-languageclient` shell that
starts `../ohh-ls` and does nothing else.

## Build

```sh
npm install
npm run compile                # emits out/extension.js
node test/tokenize-corpus.js   # grammar verification, see below
```

To actually run it in VS Code: open this folder, press F5 (Extension
Development Host), then set `ohh.registryPath` to the absolute path of
`../ohh/registry` (no default, `ohh-ls` refuses to guess) and
`ohh.serverPath` to `../ohh-ls/build/ohh-ls` if it isn't on `PATH`.
`.vscode/settings.json` already has both set for this machine's layout.

**Not published to the VS Code Marketplace.** This repo is pushed to
`github.com/MrPoloGit/vscode-ohh`, but there's no marketplace listing,
`vsce publish` has not been run, and `package.json` has no `repository`
field yet. The only ways to run this today are the Extension
Development Host above or a manually-built `.vsix`
(`npx @vscode/vsce package`), sideloaded via "Install from VSIX".

## What's implemented

- **Language registration**: `.ohh` → language id `ohh`
  (`package.json`, `language-configuration.json`): no line/block comments
  (JSON has none, confirmed by omission, not left unresolved: there is
  no comment syntax to configure), bracket matching/auto-closing for
  `{`/`}` and `[`/`]`.
- **TextMate grammar** (`syntaxes/ohh.tmLanguage.json`): a JSON grammar
  (object/array/string/number/`true`/`false`/`null`) plus one
  OHH-specific addition mirroring `tree-sitter-ohh/queries/highlights.scm`'s
  own special-casing: the **value** string of the four enum-valued keys
  (`game_type`, `bet_type`, `street`, `action`) gets a distinct scope
  (`string.quoted.double.special.enum.ohh`), found via a variable-length
  Oniguruma lookbehind on the preceding `"key":` text rather than a
  separate match-the-whole-pair rule, so the key itself still gets the
  ordinary property-name scope.
- **Snippets** (`snippets/ohh.code-snippets`): one per `game_type` value
  (6), each a complete minimal hand skeleton using only the fields
  `ohh/registry/fields.json` actually marks required, including the
  correction found while building `ohh-ls` (`tournament`,
  `tournament_info`, `table_handle`, `table_skin` are deliberately
  **not** in these skeletons, since the registry now marks them optional
  based on the real spec example omitting them).
- **Language client** (`src/extension.ts`): starts `ohh-ls` over stdio,
  full-document sync, same error-surfacing behavior as `vscode-phh`.
- **Settings**: `ohh.serverPath`, `ohh.registryPath`.

## How this was verified

1. **TypeScript compiles clean** (`npm run compile`), and the extension
   **packages correctly** with the real `vsce` CLI
   (`npx @vscode/vsce package`), 10 files, 6.84 KB, the same two cosmetic
   warnings (missing `repository`/`LICENSE`) `vscode-phh` produces, no
   functional errors.
2. **The TextMate grammar was tokenized against the real corpus**
   (`ohh/corpus/`) with `vscode-textmate` + `vscode-oniguruma`, no GUI
   window launched, same approach and same reasoning as
   `vscode-phh/test/tokenize-corpus.js`. **15/15 checks pass**, including
   a dedicated check that the multi-hand fixture's blank-line-separated
   second hand tokenizes correctly (the TextMate-grammar equivalent of
   `tree-sitter-ohh`'s own multi-object document root rule), that the
   enum-value scope lands on the *value* and not the key, and that an
   ordinary string value is explicitly confirmed to **not** get the enum
   scope.
3. **Unlike `vscode-phh`'s TextMate grammar (two real bugs found by
   testing), this grammar's first draft tokenized cleanly**, no bug to
   report here. The two failure patterns that bit PHH's grammar
   (`\b`-anchored regexes breaking on concatenated runs; a flat `match`
   rule's `patterns` field being silently ignored) were both designed
   around from the start: no concatenated-token runs exist in JSON, and
   every nested construct here (`object`, `array`) is written as
   `begin`/`end` from the first draft, never as a flat `match` with a
   `patterns` field.

## The "built-in JSON validator conflicts with `.ohh`" question, resolved by reasoning, not by GUI testing

This was a real, named risk going in:
VS Code's built-in JSON language features extension might flag a
multi-hand `.ohh` file (several blank-line-separated top-level objects,
not one JSON document) as a syntax error. Reasoning through VS Code's own
extension model resolves this without needing to launch the Extension
Development Host: the built-in JSON validator activates for documents
whose **language ID** is `json`/`jsonc`, not for any document matching a
particular file extension glob. Since this extension registers `.ohh`
under its own distinct language ID (`ohh`), a `.ohh` file's language ID is
never `json` in the first place, so the built-in validator has no reason
to run on it at all, no `"json.schemas"` exclusion or other override
needed. This is a structural argument from how VS Code's language
contribution model works, not an empirical confirmation inside a real
window; if you press F5 and open `../ohh/corpus/valid/multi-hand.ohh`,
confirming no red squiggles appear would close this out properly.

## Known limitations / explicitly not done here

- **The language client itself was not driven end-to-end against a real
  VS Code window.** `ohh-ls`'s LSP behavior is already verified directly
  over real JSON-RPC (`../ohh-ls/tests/lsp_smoke_test.py`, 25/25 checks);
  this extension's own job, starting that binary and wiring it to VS
  Code's language-client APIs, has not been exercised inside an
  Extension Development Host, for the same reason `vscode-phh` didn't:
  avoiding an unrequested GUI launch. Press F5 locally to check this by
  hand, the same way you did for `vscode-phh`.
- **No bundled/downloaded server binary.** `ohh.serverPath` must point at
  a locally built `ohh-ls`.
- **No custom FoldingRangeProvider.** VS Code's bracket-based folding
  (from `language-configuration.json`) already folds every object/array
  for free; a "fold by hand" provider matching
  `tree-sitter-ohh/queries/folds.scm`'s granularity isn't built.
- **Carries forward every scope limit `ohh-ls/README.md` documents**:
  this extension surfaces whatever diagnostics/hover text the server
  produces, and does not add its own validation on top.
