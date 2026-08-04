# Changelog

## 1.0.0

First public release.

- Interactive commit graph of the real repository: time-based lane assignment with lane reuse, branch-identity colors, click-to-trace lines, per-row commit info, checkout from any row.
- Working Tree pipeline: Working Directory → Staging → Repository → Remote → Stashes, with stage/unstage (per-file and all), discard, stash push/apply/pop/drop, commit, amend, undo-last-commit, clean.
- GUI-native clone: paste a URL on the no-repo screen, pick a destination, open the result.
- Merge and Rebase simulators backed by real `git merge` / `git rebase`, with a real per-file conflict resolve → continue/abort flow.
- Remote Sync: fetch, pull, push, and `--force-with-lease` force-push.
- Reflog, File History (`git log --follow`), and per-line blame views.
- Built-in terminal panel shows the exact command and git's real output for every action.
- Tiered refresh: lightweight status-only updates for working-tree changes; full snapshot refresh reserved for history/branch changes.
- Real-git fidelity: `stash push -u` (untracked included), stash pop restores unstaged, `reset --hard` preserves untracked files, unstage works before the first commit (`git rm --cached`).
