import { Eye, Zap } from "lucide-react";
import { isInVsCode } from "@/lib/vscode-bridge";
import { Badge } from "./Badge";

/** Tells the truth, up front, about what clicking the big button on this page actually does —
 * the merge/rebase simulators dispatch a real git command only under specific conditions (the
 * checked-out branch has to match what's being previewed, and rebase additionally requires
 * non-interactive mode). Without this, a user has no way to know whether their resolution
 * choices here are about to touch their real repository or are just a preview, which is exactly
 * the kind of ambiguity that makes a "real git GUI" feel untrustworthy. */
export function SimulatorRealnessBadge({ willRunForReal, previewReason }: { willRunForReal: boolean; previewReason?: string }) {
  if (!isInVsCode()) {
    return (
      <Badge role="history" icon={<Eye size={12} />}>
        Design preview — no repository connected
      </Badge>
    );
  }
  if (willRunForReal) {
    return (
      <Badge role="commit" icon={<Zap size={12} />}>
        Live — runs for real against your repository
      </Badge>
    );
  }
  return (
    <Badge role="staged" icon={<Eye size={12} />}>
      Preview only{previewReason ? ` — ${previewReason}` : ""}
    </Badge>
  );
}
