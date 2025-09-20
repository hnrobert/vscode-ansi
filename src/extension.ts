import {
  ExtensionContext,
  CancellationTokenSource,
  workspace,
  commands,
  window,
  ViewColumn,
  TextDocumentShowOptions,
  TextDocument,
  languages,
} from "vscode";
import * as micromatch from "micromatch";

import { AnsiDecorationProvider } from "./AnsiDecorationProvider";
import { EditorRedrawWatcher } from "./EditorRedrawWatcher";
import { AnsiContentPreviewProvider } from "./AnsiContentPreviewProvider";
import {
  executeRegisteredTextEditorDecorationProviders,
  registerTextEditorDecorationProvider,
} from "./TextEditorDecorationProvider";

export const extensionId = "HNRobert.vscode-ansi" as const;

/**
 * 检查文件是否应该自动设置为 ANSI 语言模式
 */
function shouldSetAnsiLanguageMode(document: TextDocument): boolean {
  const config = workspace.getConfiguration("ansiPreviewer");
  const autoLanguageModeFiles: string[] = config.get("autoLanguageModeFiles", ["**/*.ans", "**/*.ansi"]);

  console.log(`[ANSI Extension] Checking file: ${document.fileName}`);
  console.log(`[ANSI Extension] Config patterns:`, autoLanguageModeFiles);
  console.log(`[ANSI Extension] Current language ID: ${document.languageId}`);

  if (autoLanguageModeFiles.length === 0) {
    console.log(`[ANSI Extension] No patterns configured, skipping`);
    return false;
  }

  // 获取文件的相对路径和文件名
  const filePath = document.fileName;
  const workspaceFolder = workspace.getWorkspaceFolder(document.uri);

  let relativePath = filePath;
  const fileName = filePath.split(/[/\\]/).pop() || "";

  if (workspaceFolder) {
    relativePath = filePath.replace(workspaceFolder.uri.fsPath, "").replace(/^[/\\]/, "");
    // 将 Windows 路径分隔符转换为 Unix 风格
    relativePath = relativePath.replace(/\\/g, "/");
  }

  console.log(`[ANSI Extension] File name: ${fileName}`);
  console.log(`[ANSI Extension] Relative path: ${relativePath}`);

  const shouldSet = autoLanguageModeFiles.some((pattern: string) => {
    // 标准化模式：将 Windows 路径分隔符转换为 Unix 风格
    const normalizedPattern = pattern.replace(/\\/g, "/");

    console.log(`[ANSI Extension] Testing pattern: ${normalizedPattern}`);

    // 如果模式不包含路径分隔符，则同时匹配文件名和完整路径
    if (!normalizedPattern.includes("/")) {
      // 对于没有路径的模式（如 "*.log"），同时匹配文件名和相对路径
      const fileNameMatch = micromatch.isMatch(fileName, normalizedPattern);
      const relativePathMatch = micromatch.isMatch(relativePath, normalizedPattern);
      const expandedMatch = micromatch.isMatch(relativePath, `**/${normalizedPattern}`);

      console.log(
        `[ANSI Extension] Pattern ${normalizedPattern} - fileName match: ${fileNameMatch}, relativePath match: ${relativePathMatch}, expanded match: ${expandedMatch}`
      );

      return fileNameMatch || relativePathMatch || expandedMatch;
    } else {
      // 对于包含路径的模式，直接匹配相对路径
      const match = micromatch.isMatch(relativePath, normalizedPattern);
      console.log(`[ANSI Extension] Pattern ${normalizedPattern} - path match: ${match}`);
      return match;
    }
  });

  console.log(`[ANSI Extension] Should set ANSI language mode: ${shouldSet}`);
  return shouldSet;
}

/**
 * 为文档设置 ANSI 语言模式
 */
async function setAnsiLanguageMode(document: TextDocument, context: string): Promise<void> {
  if (document.languageId === "ansi") {
    console.log(`[ANSI Extension] Document ${document.fileName} is already in ANSI mode`);
    return;
  }

  console.log(`[ANSI Extension] Setting language mode to ANSI for ${context}: ${document.fileName}`);
  try {
    await languages.setTextDocumentLanguage(document, "ansi");
    console.log(`[ANSI Extension] Successfully set language mode to ANSI for ${context}`);
  } catch (error) {
    console.error(`[ANSI Extension] Error setting language mode for ${context}:`, error);
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  console.log(`[ANSI Extension] Extension activated`);

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

  // 监听配置变更事件
  context.subscriptions.push(
    workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("ansiPreviewer.autoLanguageModeFiles")) {
        console.log(`[ANSI Extension] Configuration changed, re-evaluating all open documents`);

        // 重新检查所有打开的文档
        for (const editor of window.visibleTextEditors) {
          const document = editor.document;
          if (shouldSetAnsiLanguageMode(document)) {
            await setAnsiLanguageMode(document, "config changed - visible document");
          }
        }

        // 也检查当前活动编辑器
        if (window.activeTextEditor) {
          const document = window.activeTextEditor.document;
          if (shouldSetAnsiLanguageMode(document)) {
            await setAnsiLanguageMode(document, "config changed - active document");
          }
        }
      }
    })
  );

  // 监听文档打开事件，自动设置 ANSI 语言模式
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(async (document: TextDocument) => {
      console.log(`[ANSI Extension] Document opened: ${document.fileName}, language: ${document.languageId}`);
      if (shouldSetAnsiLanguageMode(document)) {
        await setAnsiLanguageMode(document, "document opened");
      }
    })
  );

  // 监听活动编辑器变化事件，用于捕获通过文件浏览器打开的文件
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        console.log(
          `[ANSI Extension] Active editor changed: ${editor.document.fileName}, language: ${editor.document.languageId}`
        );
        if (shouldSetAnsiLanguageMode(editor.document)) {
          await setAnsiLanguageMode(editor.document, "active editor changed");
        }
      }
    })
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

  // 检查当前已打开的文档
  console.log(`[ANSI Extension] Checking already opened documents`);
  if (window.activeTextEditor) {
    console.log(`[ANSI Extension] Found active editor: ${window.activeTextEditor.document.fileName}`);
    const document = window.activeTextEditor.document;
    if (shouldSetAnsiLanguageMode(document)) {
      await setAnsiLanguageMode(document, "already opened document");
    }
  }

  // 检查所有可见编辑器中的文档
  for (const editor of window.visibleTextEditors) {
    const document = editor.document;
    if (shouldSetAnsiLanguageMode(document)) {
      await setAnsiLanguageMode(document, "visible document");
    }
  }
}

export function deactivate(): void {
  // sic
}
