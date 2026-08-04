import type { ConflictOp, DataRequest, DataResult, GitCommand, HostMessage, NativeVsCodeCommand, WebviewMessage } from "./vscode-protocol";

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cachedApi: VsCodeApi | null = null;

/** True when running inside the VS Code webview; false in standalone browser preview. */
export function isInVsCode(): boolean {
  return typeof acquireVsCodeApi === "function";
}

function getApi(): VsCodeApi {
  if (!cachedApi) cachedApi = acquireVsCodeApi();
  return cachedApi;
}

export function postToHost(message: WebviewMessage): void {
  if (isInVsCode()) getApi().postMessage(message);
}

/** Kicks off one of VS Code's own built-in Git commands (clone / init) — the host just
 * forwards this to `vscode.commands.executeCommand`; VS Code owns the whole rest of the
 * flow (prompts, and the window reload once it's done). A no-op in standalone browser
 * preview, same as every other host-only action. */
export function runVsCodeCommand(command: NativeVsCodeCommand): void {
  postToHost({ type: "runVsCodeCommand", command });
}

export function onHostMessage(handler: (message: HostMessage) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data as HostMessage);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export interface GitCommandOutcome {
  output: string;
  /** Set when the command stopped mid-way on a real, resolvable conflict rather than
   * completing — the webview should open the real conflict-resolution flow instead of
   * treating this as a plain success. */
  conflict?: ConflictOp;
}

let requestSeq = 0;
const pendingCommands = new Map<string, { resolve: (outcome: GitCommandOutcome) => void; reject: (err: Error) => void }>();

// A single, module-level listener handles every in-flight command's result, matched by
// requestId — set up once, not per-call, so callers don't leak a new `message` listener
// on every stage/commit/push.
onHostMessage((message) => {
  if (message.type !== "commandResult") return;
  const pending = pendingCommands.get(message.requestId);
  if (!pending) return;
  pendingCommands.delete(message.requestId);
  if (message.ok) pending.resolve({ output: message.output, conflict: message.conflict });
  else pending.reject(new Error(message.error));
});

/** Runs a real git command on the extension host and resolves with what git actually
 * printed (or rejects with git's own error message). Only meaningful inside VS Code —
 * callers are responsible for falling back to the simulated store logic in standalone
 * browser preview. */
export function runGitCommand(command: GitCommand): Promise<GitCommandOutcome> {
  const requestId = `cmd-${++requestSeq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    pendingCommands.set(requestId, { resolve, reject });
    postToHost({ type: "runCommand", requestId, command });
  });
}

/** Clones a repository through our own GUI flow: the host opens a destination-folder dialog,
 * runs the real `git clone`, and resolves with git's actual output (or rejects with its error).
 * Resolution can take a while — the folder dialog waits on the user, then the network. */
export function cloneRepo(url: string): Promise<GitCommandOutcome> {
  const requestId = `clone-${++requestSeq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    pendingCommands.set(requestId, { resolve, reject });
    postToHost({ type: "cloneRepo", requestId, url });
  });
}

const pendingDataRequests = new Map<string, { resolve: (data: DataResult) => void; reject: (err: Error) => void }>();

onHostMessage((message) => {
  if (message.type !== "dataResult") return;
  const pending = pendingDataRequests.get(message.requestId);
  if (!pending) return;
  pendingDataRequests.delete(message.requestId);
  if (message.ok) pending.resolve(message.data);
  else pending.reject(new Error(message.error));
});

/** Fetches real, on-demand data (a file's diff, the reflog, a file's blame) from the
 * extension host. Only meaningful inside VS Code. */
export function requestData(request: DataRequest): Promise<DataResult> {
  const requestId = `data-${++requestSeq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    pendingDataRequests.set(requestId, { resolve, reject });
    postToHost({ type: "requestData", requestId, request });
  });
}
