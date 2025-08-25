import {
  ExtensionContext,
  CancellationTokenSource,
  workspace,
  commands,
  window,
  ViewColumn,
  TextDocumentShowOptions,
} from "vscode";

import { AnsiDecorationProvider } from "./AnsiDecorationProvider";
import { EditorRedrawWatcher } from "./EditorRedrawWatcher";
import { AnsiContentPreviewProvider } from "./AnsiContentPreviewProvider";
import {
  executeRegisteredTextEditorDecorationProviders,
  registerTextEditorDecorationProvider,
} from "./TextEditorDecorationProvider";

export const extensionId = "HNRobert.vscode-ansi" as const;

export async function activate(context: ExtensionContext): Promise<void> {
  const editorRedrawWatcher = new EditorRedrawWatcher();
  context.subscriptions.push(editorRedrawWatcher);

  const ansiContentPreviewProvider = new AnsiContentPreviewProvider(editorRedrawWatcher);
  context.subscriptions.push(ansiContentPreviewProvider);

  context.subscriptions.push(
    workspace.registerTextDocumentContentProvider(AnsiContentPreviewProvider.scheme, ansiContentPreviewProvider)
  );

  const showPreview = async (options?: TextDocumentShowOptions) => {
    const actualUri = window.activeTextEditor?.document.uri;

    if (!actualUri) {
      return;
    }

    const providerUri = AnsiContentPreviewProvider.toProviderUri(actualUri);

    await window.showTextDocument(providerUri, options);
  };

  context.subscriptions.push(
    commands.registerCommand(`${extensionId}.showPreview`, () => showPreview({ viewColumn: ViewColumn.Active }))
  );
  context.subscriptions.push(
    commands.registerCommand(`${extensionId}.showPreviewToSide`, () => showPreview({ viewColumn: ViewColumn.Beside }))
  );

  const ansiDecorationProvider = new AnsiDecorationProvider();
  context.subscriptions.push(ansiDecorationProvider);

  context.subscriptions.push(registerTextEditorDecorationProvider(ansiDecorationProvider));

  context.subscriptions.push(
    editorRedrawWatcher.onEditorRedraw(async (editor) => {
      const tokenSource = new CancellationTokenSource();
      await executeRegisteredTextEditorDecorationProviders(editor, tokenSource.token);
      tokenSource.dispose();
    })
  );

  context.subscriptions.push(
    commands.registerTextEditorCommand(`${extensionId}.insertEscapeCharacter`, (editor, edit) => {
      edit.delete(editor.selection);
      edit.insert(editor.selection.end, "\x1b");
    })
  );
}

export function deactivate(): void {
  // sic
}
