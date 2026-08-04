import { useCallback, useRef, useState } from "react";

export interface PanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const UNBOUNDED: PanBounds = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };

function clampNum(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function usePanZoom(initial = { x: 0, y: 0, scale: 1 }) {
  const [transform, setTransform] = useState(initial);
  const dragging = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const bounds = useRef<PanBounds>(UNBOUNDED);

  const clampTransform = useCallback((t: typeof initial) => {
    const b = bounds.current;
    const x = clampNum(t.x, b.minX, b.maxX);
    const y = clampNum(t.y, b.minY, b.maxY);
    return x === t.x && y === t.y ? t : { ...t, x, y };
  }, []);

  // The graph can only ever be as wide/tall as its content (which grows with more commits or a
  // burst of concurrent branches), so how far you can pan is recomputed whenever the container
  // resizes, the graph's own size changes, or the zoom level changes. At least one edge always
  // stays reachable-but-not-passable: you can never drag past showing blank space beyond the
  // graph's own top-left anchor, and — once the content is smaller than the viewport in a given
  // direction — that direction is pinned entirely instead of sloshing around in empty space.
  const setBounds = useCallback(
    (b: PanBounds) => {
      bounds.current = b;
      setTransform((t) => clampTransform(t));
    },
    [clampTransform]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      dragging.current = { startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y };
    },
    [transform]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragging.current.startX;
      const dy = e.clientY - dragging.current.startY;
      setTransform((t) => clampTransform({ ...t, x: dragging.current!.originX + dx, y: dragging.current!.originY + dy }));
    },
    [clampTransform]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setTransform((t) => {
          const next = Math.min(2.5, Math.max(0.35, t.scale - e.deltaY * 0.0018));
          return clampTransform({ ...t, scale: next });
        });
      } else {
        setTransform((t) => clampTransform({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
      }
    },
    [clampTransform]
  );

  const zoomBy = useCallback(
    (delta: number) => {
      setTransform((t) => clampTransform({ ...t, scale: Math.min(2.5, Math.max(0.35, t.scale + delta)) }));
    },
    [clampTransform]
  );

  const reset = useCallback(() => setTransform(clampTransform(initial)), [initial, clampTransform]);

  const setPan = useCallback(
    (x: number, y: number) => {
      setTransform((t) => clampTransform({ ...t, x, y }));
    },
    [clampTransform]
  );

  return { transform, onPointerDown, onPointerMove, onPointerUp, onWheel, zoomBy, reset, setPan, setTransform, setBounds };
}
