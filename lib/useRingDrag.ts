"use client";

import { useCallback, useRef, useState } from "react";

interface UseRingDragOptions {
  // How many seconds one full 360° trip around the ring represents.
  revolutionSeconds: number;
  // Read fresh at drag-start so the handle starts exactly where the ring
  // already is, instead of jumping to wherever the pointer first lands.
  getElapsedSeconds: () => number;
  // Fired continuously while dragging with the new elapsed value, already
  // clamped to >= 0. Never fires an upper bound — multiple laps over the
  // target is the point (see revolutionSeconds).
  onChange: (seconds: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const TWO_PI = Math.PI * 2;

// Converts a pointer position to "angle from 12 o'clock, clockwise, in
// [0, 2π)". The ring SVG is rendered with `-rotate-90`, so its visual 12
// o'clock is raw angle -π/2 in untransformed screen coordinates — the +π/2
// below compensates for that. rect.left/top + width/height/2 (the element's
// own bounding box center) is rotation-invariant, so this works regardless
// of the ring's actual pixel size.
function angleFromPoint(clientX: number, clientY: number, rect: DOMRect): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let a = Math.atan2(clientY - cy, clientX - cx) + Math.PI / 2;
  if (a < 0) a += TWO_PI;
  return a;
}

// Shortest signed angular distance from `from` to `to`, in (-π, π] — lets a
// full-speed spin accumulate past 2π (winding) or below 0 (unwinding)
// instead of wrapping/jumping at the 0/2π seam.
function shortestDelta(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

// A touchable/draggable ring: attach `handlers` to a plain HTML element that
// covers as much of the surrounding view as makes sense (not just the ring
// itself — a thin stroke is a poor touch target, and SVG's `pointer-events:
// stroke` has inconsistent browser support) and `svgRef` to the ring's own
// <svg> so the gesture's angle math has a stable center to measure from.
// Dragging around it winds elapsed time like a rotary dial: one full
// clockwise lap adds `revolutionSeconds`; unwinding counter-clockwise past
// the start clamps at zero.
export function useRingDrag({ revolutionSeconds, getElapsedSeconds, onChange, onDragStart, onDragEnd }: UseRingDragOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Mirrors `isDragging` but read synchronously inside the handlers below —
  // React state updates aren't guaranteed visible to a closure created in
  // the same tick, and a fast pointerdown->pointermove shouldn't be able to
  // race past the "are we actually dragging yet" check.
  const isDraggingRef = useRef(false);
  const totalAngleRef = useRef(0);
  const lastAngleRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || revolutionSeconds <= 0) return;
      // Stops the browser's own drag/text-selection gesture from competing
      // with ours — without this, a mouse drag anywhere near text just
      // highlights it instead of reaching our handler.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = svg.getBoundingClientRect();
      lastAngleRef.current = angleFromPoint(e.clientX, e.clientY, rect);
      totalAngleRef.current = (getElapsedSeconds() / revolutionSeconds) * TWO_PI;
      isDraggingRef.current = true;
      setIsDragging(true);
      onDragStart?.();
    },
    [revolutionSeconds, getElapsedSeconds, onDragStart]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || !isDraggingRef.current) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const angle = angleFromPoint(e.clientX, e.clientY, rect);
      totalAngleRef.current += shortestDelta(lastAngleRef.current, angle);
      lastAngleRef.current = angle;
      const seconds = Math.max(0, (totalAngleRef.current / TWO_PI) * revolutionSeconds);
      onChange(seconds);
    },
    [revolutionSeconds, onChange]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      isDraggingRef.current = false;
      setIsDragging(false);
      onDragEnd?.();
    },
    [onDragEnd]
  );

  return {
    svgRef,
    isDragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
