import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const MARGIN = 8;

export type MenuPlacement = {
  left: number;
  top: number;
  maxHeight?: number;
};

/** Measure natural menu size, then clamp into the viewport with margin. */
export function clampMenuPosition(
  el: HTMLElement,
  x: number,
  y: number,
  margin = MARGIN,
): MenuPlacement {
  const prevMax = el.style.maxHeight;
  el.style.maxHeight = "none";
  const width = el.offsetWidth;
  const height = el.scrollHeight;
  el.style.maxHeight = prevMax;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxAvail = Math.max(margin, vh - margin * 2);

  const left = Math.max(margin, Math.min(x, vw - width - margin));

  if (height > maxAvail) {
    return { left, top: margin, maxHeight: maxAvail };
  }

  const top = Math.max(margin, Math.min(y, vh - height - margin));
  return { left, top };
}

/** Place a fixed menu at (x,y), then re-clamp after layout (hides first paint). */
export function useClampedMenuStyle(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({
    left: x,
    top: y,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { left, top, maxHeight } = clampMenuPosition(el, x, y);
    setStyle({
      left,
      top,
      visibility: "visible",
      ...(maxHeight != null ? { maxHeight } : {}),
    });
  }, [x, y]);

  return style;
}
