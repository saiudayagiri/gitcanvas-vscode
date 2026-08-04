# Git Visualizer — Design Prototype

A standalone, frontend-only design prototype for **Git Visualizer**: "show what Git is thinking" instead of reading terminal output. Everything runs on realistic mock data — there is no Git integration, no backend, and this is not a VS Code extension. The goal is to explore and prove out the ideal UI/UX before any extension work begins.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static production build.

## What's here

A mock repository (`lumen-analytics`) with a deliberately rich, realistic topology — a diverged `main`/`origin main`, an unpublished in-progress feature branch, two recently-merged branches, and one stale/abandoned experiment — so every screen has real states to visualize instead of a trivial linear history.

Eight screens, reachable from the sidebar:

- **Dashboard** — HEAD chain, working tree summary, remote status, activity heatmap, repo health.
- **Commit Graph** — pannable/zoomable SVG DAG with lane-based branch coloring, hover, click-to-inspect, branch highlighting, and text filtering.
- **Working Tree** — an interactive sandbox: stage, commit, and push files through Working Directory → Staging → Repository → Remote, with files animating between columns.
- **Branches** — a Gantt-style topology showing where each branch forked from `main` and whether/where it merged back in, plus branch cards with ahead/behind, contributors, and status.
- **File History** — per-file commit timeline, including a rename-chain example (`AccountSettings.tsx` → `Settings.tsx`).
- **Merge Simulator** — pick a branch, see real computed conflicts (based on overlapping file changes), resolve them, and watch the merge commit animate in.
- **Rebase Simulator** — replay a branch's commits onto `main`'s tip with before/after hash rewriting shown explicitly.
- **Remote Sync** — fetch/pull/push against a genuinely diverged remote, including a non-fast-forward push rejection before pulling.

A global **Commit Inspector** slide-over (author, relationships, files changed) and **Educational Mode** toggle (what/why/command/undo for the current view) are available everywhere. Dark, light, and high-contrast themes are all fully supported via `data-theme` on `<html>`.

## Structure

```
src/
  lib/            mock data, commit-graph layout math, merge/rebase simulation, file-history indexing
  types/          shared Git domain types
  components/
    layout/       sidebar, top bar, command palette, app shell
    ui/           design-system primitives (Avatar, Badge, Button, Panel, EducationalNote, ...)
    commit-graph/ pan/zoom + SVG graph renderer
    working-tree/ pipeline column + file chip
    branch-explorer/
    commit-inspector/
    dashboard/
  pages/          one file per screen
  context/        theme + educational-mode providers
  store/          small Zustand store for cross-component UI state (inspector, command palette)
```

All mock data lives in `src/lib/mock-data.ts` — edit it to reshape the demo repository (branches, commits, working-tree state, remote divergence) without touching any component.
