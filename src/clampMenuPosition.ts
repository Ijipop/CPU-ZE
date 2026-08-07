import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const EDGE_MARGIN = 8;
/** Keep menus clear of the fixed titlebar (`--titlebar-h: 36px`). */
const TOP_SAFE = 40;

export type MenuPlacement = {
  left: number;
  top: number;
  maxHeight?: number;
};

/** Measure natural menu size, then clamp into the viewport with safe margins. */
export function clampMenuPosition(
  el: HTMLElement,
  x: number,
  y: number,
  edge = EDGE_MARGIN,
  topSafe = TOP_SAFE,
): MenuPlacement {
  const prevMax = el.style.maxHeight;
  el.style.maxHeight = "none";
  const width = el.offsetWidth;
  const height = el.scrollHeight;
  el.style.maxHeight = prevMax;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxAvail = Math.max(edge, vh - topSafe - edge);

  const left = Math.max(edge, Math.min(x, vw - width - edge));

  if (height > maxAvail) {
    return { left, top: topSafe, maxHeight: maxAvail };
  }

  const top = Math.max(topSafe, Math.min(y, vh - height - edge));
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
