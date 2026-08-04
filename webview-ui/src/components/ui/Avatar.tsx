import { colorForSeed, initials } from "@/lib/avatar";
import type { Author } from "@/types/git";
import clsx from "clsx";

export function Avatar({ author, size = 24, ring = false }: { author: Author; size?: number; ring?: boolean }) {
  const color = colorForSeed(author.colorSeed);
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-black/80",
        ring && "ring-2 ring-[var(--bg-surface)]"
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, black))`,
      }}
      title={author.name}
    >
      {initials(author.name)}
    </div>
  );
}

export function AvatarStack({ authors, size = 22 }: { authors: Author[]; size?: number }) {
  return (
    <div className="flex -space-x-2">
      {authors.map((a) => (
        <Avatar key={a.id} author={a} size={size} ring />
      ))}
    </div>
  );
}
