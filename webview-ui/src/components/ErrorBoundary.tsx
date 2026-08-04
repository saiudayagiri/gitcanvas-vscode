import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time crashes in whatever it wraps and shows a real error screen instead of
 * leaving the whole extension blank — this is what should have caught the exact bug where an
 * unresolvable commit reference (getCommit(...)! on a hash the loaded snapshot didn't contain)
 * took down the entire webview the moment the Branches page rendered. A crash is now contained
 * and visible instead of silent and total. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GitCanvas render crash:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full min-h-[400px] w-full flex-col items-center justify-center gap-4 bg-[var(--bg-canvas)] px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-git-conflict/10 text-git-conflict">
          <AlertTriangle size={22} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--text-primary)]">Something went wrong rendering this</h1>
          <p className="mt-1.5 max-w-md text-[13px] text-[var(--text-secondary)]">
            This is a bug in GitCanvas, not a problem with your repository. Your repo hasn't been touched.
          </p>
        </div>
        <pre className="max-w-lg overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-left font-mono text-[11px] text-git-conflict">
          {error.message}
        </pre>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
