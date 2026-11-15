# vscode-ohh

The VS Code integration for OHH.

## Build

```sh
npm install
npm run compile                # emits out/extension.js
node test/tokenize-corpus.js   # grammar verification, see below
```

To actually run it in VS Code: open this folder, press F5 (Extension
Development Host), then set `ohh.registryPath` to the absolute path of
`../ohh-data/registry` (no default, `ohh-ls` refuses to guess) and
`ohh.serverPath` to `../ohh-ls/build/ohh-ls` if it isn't on `PATH`.
`.vscode/settings.json` already has both set for this machine's layout.

**Not published to the VS Code Marketplace.** This repo is pushed to
`github.com/MrPoloGit/vscode-ohh`, but there's no marketplace listing,
`vsce publish` has not been run, and `package.json` has no `repository`
field yet. The only ways to run this today are the Extension
Development Host above or a manually-built `.vsix`
(`npx @vscode/vsce package`), sideloaded via "Install from VSIX".
