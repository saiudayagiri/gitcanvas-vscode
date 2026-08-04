import { GitCommitHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./Button";
import { Panel } from "./Panel";

/** Shown in place of pages that fundamentally need commit history (merge/rebase preview,
 * branch topology, commit graph) when a real, freshly-initialized repository has zero
 * commits yet. Working Tree stays reachable via the CTA so the user can make that first
 * commit — nothing here blocks navigation, it just avoids rendering a page that has no
 * data to show. */
export function EmptyRepoNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <Panel className="flex flex-col items-center gap-3 py-14 text-center" glass>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-git-branch/10 text-git-branch">
          <GitCommitHorizontal size={20} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 max-w-sm text-[13px] text-[var(--text-secondary)]">{detail}</p>
        </div>
        <Link to="/working-tree">
          <Button size="sm" variant="primary">
            Go to Working Tree
          </Button>
        </Link>
      </Panel>
    </div>
  );
}
