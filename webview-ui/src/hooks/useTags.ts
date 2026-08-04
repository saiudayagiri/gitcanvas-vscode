import { commits } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";
import type { Tag } from "@/store/ui-store";

/** All tags that currently exist, live (mock + session-created, minus deleted). */
export function useAllTags(): Tag[] {
  const createdTags = useUIStore((s) => s.createdTags);
  const deletedTagNames = useUIStore((s) => s.deletedTagNames);
  const staticTags: Tag[] = commits.flatMap((c) => c.refs.map((name) => ({ name, hash: c.hash })));
  return [...staticTags, ...createdTags].filter((t) => !deletedTagNames.includes(t.name));
}

/** The tag names pointing at a specific commit, live. */
export function useCommitTags(hash: string): string[] {
  return useAllTags()
    .filter((t) => t.hash === hash)
    .map((t) => t.name);
}

