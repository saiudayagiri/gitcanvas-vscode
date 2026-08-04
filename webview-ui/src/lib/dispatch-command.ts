import { isInVsCode, runGitCommand } from "./vscode-bridge";
import { useUIStore } from "@/store/ui-store";
import type { GitCommand } from "./vscode-protocol";

/** Runs a real git command and swaps the toy terminal's scripted output for what git
 * actually printed once it resolves — a no-op (resolves to "") in standalone browser
 * preview. Shared by the merge/rebase/remote-sync pages, which dispatch real commands
 * outside the store (the store's own actions have an equivalent inlined in ui-store.ts,
 * where it can use its closure's `set`/`get` directly instead of the global `useUIStore`
 * accessors). Rejects with the real git error so callers that need to await completion
 * (e.g. to drive a busy spinner) can react to it directly, in addition to it landing in
 * `lastCommandError` for the global toast. */
export async function dispatchAndLogAsync(command: GitCommand): Promise<string> {
  if (!isInVsCode()) return "";
  try {
    const { output, conflict } = await runGitCommand(command);
    if (output) {
      const log = useUIStore.getState().commandLog;
      const last = log[log.length - 1];
      if (last) useUIStore.setState({ commandLog: log.map((e) => (e.id === last.id ? { ...e, output } : e)) });
    }
    if (conflict) useUIStore.setState({ realConflictOp: conflict });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useUIStore.setState({ lastCommandError: message });
    throw err instanceof Error ? err : new Error(message);
  }
}

/** Fire-and-forget form of {@link dispatchAndLogAsync}, for callers that don't need to
 * await completion (a failure still reaches `lastCommandError` and the global toast). */
export function dispatchAndLog(command: GitCommand): void {
  void dispatchAndLogAsync(command);
}
