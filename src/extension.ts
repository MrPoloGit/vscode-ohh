// The VS Code extension is deliberately thin: it starts ohh-ls and hosts
// the LSP client. No parsing, no validation logic lives here; all of
// that is ohh-ls, same principle as vscode-phh/src/extension.ts.

import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("ohh");
  const serverPath = config.get<string>("serverPath", "ohh-ls");
  const registryPath = config.get<string>("registryPath", "");

  if (!registryPath) {
    vscode.window.showErrorMessage(
      'OHH: the "ohh.registryPath" setting is not set. ohh-ls needs the path ' +
        "to the ohh-data/registry directory to start."
    );
    return;
  }

  const serverOptions: ServerOptions = {
    command: serverPath,
    args: [registryPath],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "ohh" }],
  };

  client = new LanguageClient("ohh-ls", "OHH Language Server", serverOptions, clientOptions);

  client.start().catch((err: unknown) => {
    vscode.window.showErrorMessage(
      `OHH: failed to start ohh-ls at "${serverPath}": ${String(err)}`
    );
  });

  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
