import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import clsx from "clsx";
import type { TodoItem, RebaseAction } from "@/lib/interactive-rebase";
import { Avatar } from "../ui/Avatar";

const ACTIONS: { value: RebaseAction; label: string; hint: string }[] = [
  { value: "pick", label: "pick", hint: "use commit as-is" },
  { value: "reword", label: "reword", hint: "use commit, edit the message" },
  { value: "edit", label: "edit", hint: "use commit, pause to amend" },
  { value: "squash", label: "squash", hint: "fold into previous, combine messages" },
  { value: "fixup", label: "fixup", hint: "fold into previous, discard this message" },
  { value: "drop", label: "drop", hint: "remove commit entirely" },
];

const ACTION_TONE: Record<RebaseAction, string> = {
  pick: "text-git-branch",
  reword: "text-git-remote",
  edit: "text-git-staged",
  squash: "text-accent",
  fixup: "text-accent",
  drop: "text-git-conflict",
};

/** Real drag-and-drop reordering — squash/fixup fold into whichever commit sits directly above
 * them once the list settles (see buildGroups in interactive-rebase.ts), so dragging a commit
 * to a new position is a genuinely functional edit, not a cosmetic reshuffle. The up/down
 * buttons stay for precise single-step moves and keep this usable without a pointer; dnd-kit's
 * KeyboardSensor also makes the drag handle itself operable from the keyboard (Space to pick
 * up, arrow keys to move, Space to drop). */
export function RebaseTodoEditor({
  todo,
  onChange,
}: {
  todo: TodoItem[];
  onChange: (next: TodoItem[]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= todo.length) return;
    onChange(arrayMove(todo, index, target));
  };

  const setAction = (index: number, action: RebaseAction) => {
    const next = [...todo];
    next[index] = { ...next[index], action };
    onChange(next);
  };

  const setMessage = (index: number, message: string) => {
    const next = [...todo];
    next[index] = { ...next[index], message };
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = todo.findIndex((t) => t.id === active.id);
    const newIndex = todo.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(todo, oldIndex, newIndex));
  };

  const activeItem = activeId ? todo.find((t) => t.id === activeId) : undefined;
  const activeIndex = activeItem ? todo.indexOf(activeItem) : -1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={todo.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {todo.map((item, i) => (
            <SortableTodoRow
              key={item.id}
              item={item}
              index={i}
              total={todo.length}
              onMove={move}
              onSetAction={setAction}
              onSetMessage={setMessage}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem ? (
          <TodoRowContent
            item={activeItem}
            index={activeIndex}
            total={todo.length}
            onMove={() => {}}
            onSetAction={() => {}}
            onSetMessage={() => {}}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface RowProps {
  item: TodoItem;
  index: number;
  total: number;
  onMove: (index: number, dir: -1 | 1) => void;
  onSetAction: (index: number, action: RebaseAction) => void;
  onSetMessage: (index: number, message: string) => void;
  dragging?: boolean;
}

function SortableTodoRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-30" : undefined}>
      <TodoRowContent {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TodoRowContent({
  item,
  index,
  total,
  onMove,
  onSetAction,
  onSetMessage,
  dragging,
  dragHandleProps,
}: RowProps & { dragHandleProps?: Record<string, unknown> }) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-3 py-2.5 transition-colors",
        item.action === "drop"
          ? "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] opacity-50"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface-2)]",
        dragging && "border-accent/40 shadow-2xl"
      )}
    >
      <div className="flex items-center gap-2.5">
        <button
          {...dragHandleProps}
          className="focus-ring shrink-0 cursor-grab touch-none text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={13} />
        </button>
        <div className="flex shrink-0 flex-col">
          <button
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="focus-ring flex h-4 w-4 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-20"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="focus-ring flex h-4 w-4 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-20"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        <select
          value={item.action}
          onChange={(e) => onSetAction(index, e.target.value as RebaseAction)}
          className={clsx(
            "focus-ring w-[92px] shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] py-1 pl-2 pr-1 text-[11px] font-semibold uppercase tracking-wide",
            ACTION_TONE[item.action]
          )}
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        <Avatar author={item.commit.author} size={22} />

        <div className="min-w-0 flex-1">
          {item.action === "reword" ? (
            <input
              value={item.message}
              onChange={(e) => onSetMessage(index, e.target.value)}
              className="focus-ring h-6 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-1.5 text-[12px] text-[var(--text-primary)]"
            />
          ) : (
            <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{item.commit.subject}</div>
          )}
          <div className="mt-0.5 font-tabular text-[10px] text-[var(--text-tertiary)]">
            {item.commit.shortHash} &middot; {ACTIONS.find((a) => a.value === item.action)?.hint}
          </div>
        </div>
      </div>
    </div>
  );
}
