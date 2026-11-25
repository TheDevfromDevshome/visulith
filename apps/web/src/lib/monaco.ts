import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Bundle Monaco locally so the generated-code viewer also works offline in the Tauri shell.
(globalThis as { MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker } }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });

export { Editor };
